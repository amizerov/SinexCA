"use client";
import { useEffect, useMemo, useState,useCallback } from "react";
import Link from "next/link";
import { RefreshCw, ListOrdered,PanelRight,Activity } from "lucide-react";
import { useMarketResource } from "@/hooks/use-market-resource";
import { useMarketCandles } from "@/hooks/use-market-candles";
import { useMarketTickers } from "@/hooks/use-market-tickers";
import { CandlestickChart } from "./CandlestickChart";
import { CoinIcon } from "./CoinIcon";
import { CoinInfoDialog } from "./CoinInfoDialog";
import { OrderBookDialog } from "./OrderBookDialog";
import { MarketsPanel } from "./MarketsPanel";
import { BrandMark } from "./BrandMark";
import { EXCHANGES, EXCHANGE_IDS } from "@/lib/market/exchange-config";
import { compact, coinNames, percent, price } from "@/lib/market/format";
import { type ExchangeId, type Timeframe, type TradingPair } from "@/lib/market/types";
import { exchangeTimeframes,intervalSpec,nearestTimeframe,wsInterval,shiftInterval } from "@/lib/market/intervals";
import { usePairOrder } from "@/hooks/use-pair-order";
import { AccountButton,useAccount } from "@/components/Account";
import { useIndicatorPreferences } from "@/hooks/use-indicator-preferences";
import { hasIndicators } from "@/lib/indicators/settings";
import {usdtVolume} from "@/lib/market/usdt-volume";
import {useMarketWorkspace} from "@/hooks/use-market-workspace";
import {quoteAssets,resolveQuote,filterQuote,selectedPair} from "@/lib/market/pair-selection";
import {useDemoOrders} from "@/hooks/use-demo-orders";
import {DemoOrderDialog,DemoOrdersPanel,type OrderDraft} from "./DemoTrading";
import {TradesPanel} from "./TradesPanel";
import {TerminalSideColumn} from "./TerminalSideColumn";
import {PanelDockProvider} from "./PanelDock";
import {useChartTrades} from "@/hooks/use-chart-trades";
import {useDockViewport} from "@/hooks/use-order-book-dock";

export function MarketDashboard() {
  const {session}=useAccount();
  const orders=useDemoOrders();
  const wide=useDockViewport();
  const [orderDraft,setOrderDraft]=useState<(OrderDraft&{pair:TradingPair;ownerId:string|undefined})|null>(null);
  const {workspace:{exchange,selected,quote:requestedQuote,selectedQuote,timeframe,orderBookOpen,marketsOpen,tradesOpen,marketPanel,tradesDocked,tradesSide},updateWorkspace,workspaceError,retryWorkspace}=useMarketWorkspace();
  const setSelected=useCallback((pair:TradingPair)=>updateWorkspace({selected:pair.baseAsset,selectedQuote:pair.quoteAsset}),[updateWorkspace]);
  const setTimeframe=(timeframe:Timeframe)=>updateWorkspace({timeframe});
  const setOrderBookOpen=(orderBookOpen:boolean)=>updateWorkspace({orderBookOpen});
  const config = EXCHANGES[exchange];
  const catalog = useMarketResource<TradingPair[]>(`/api/market/pairs?exchange=${exchange}&quote=all`);
  const listQuote=resolveQuote(catalog.data,exchange,requestedQuote);
  const currencies=useMemo(()=>quoteAssets(catalog.data||[]),[catalog.data]);
  const visiblePairs=useMemo(()=>catalog.data?filterQuote(catalog.data,listQuote):undefined,[catalog.data,listQuote]);
  const pairs={...catalog,data:visiblePairs};
  const [coinInfoOpen,setCoinInfoOpen]=useState(false);
  const availableTimeframes=exchangeTimeframes(exchange);
  const candleStream=!!wsInterval(exchange,timeframe);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"volume" | "change" | "name">("volume");
  const [now, setNow] = useState<number>();
  const pair = selectedPair(pairs.data,selected,selectedQuote||config.quote);
  const quote = pair?.quoteAsset||(listQuote==="all"?config.quote:listQuote);
  const preferences=useIndicatorPreferences(session?.ownerId,pair?{exchange,marketType:"spot",symbol:pair.symbol}:undefined);
  const tickers = useMarketTickers(exchange,pairs.data,pair,listQuote);
  const tickerMap = useMemo(() => new Map(tickers.data?.map(t => [t.symbol, t])), [tickers.data]);
  const statsReady=!!pairs.data&&!tickers.loading;
  const volumeAvailable=listQuote!=="all"&&!!tickers.data?.some(t=>t.quoteVolume24h!=null);
  const changeAvailable=!!tickers.data?.some(t=>t.priceChangePercent24h!=null);
  const effectiveSort=statsReady&&((sort==="volume"&&!volumeAvailable)||(sort==="change"&&!changeAvailable))?"name":sort;
  const listLoading=!pairs.data?pairs.loading:sort!=="name"&&!statsReady;
  const orderedPairs=usePairOrder(exchange,pairs.data,tickerMap,effectiveSort,!listLoading);
  const ticker = pair ? tickerMap.get(pair.symbol) : undefined;
  const market = useMarketCandles(exchange, pair, timeframe,hasIndicators(preferences.settings));
  const list = useMemo(() => {
    return orderedPairs.filter(p => `${p.baseAsset} ${p.symbol} ${coinNames[p.baseAsset] || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  }, [orderedPairs, search]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const latestCandle = market.candles.at(-1);
  const chartTrades=useChartTrades(exchange,pair?.symbol,market.candles[0]?.time,latestCandle?shiftInterval(latestCandle.time,timeframe,1):undefined);
  const trade=pair&&tickers.status==="live"?tickers.ticks?.get(pair.symbol):undefined;
  const lastPrice = trade?.price??ticker?.lastPrice??market.livePrice??latestCandle?.close;
  const conversionSymbol=catalog.data?.find(p=>p.baseAsset==="USDT"&&p.quoteAsset==="USD")?.symbol;
  const usdtUsdRate=conversionSymbol?tickerMap.get(conversionSymbol)?.lastPrice:undefined;
  const volume=usdtVolume(pair,ticker,lastPrice,usdtUsdRate);
  const live = tickers.status === "live";
  const tradeConnected=!!tickers.connection?.connected&&!!tickers.connection?.subscribed;
  const staleTicker = !!ticker && !!now && now - ticker.receivedAt > 20_000;
  const staleCandles = !tickers.lastStreamAt || (!!now && now - tickers.lastStreamAt > 20000);
  const error = workspaceError || pairs.error || tickers.error || market.error;
  const change = ticker?.priceChangePercent24h;
  function refresh() { pairs.refresh(); tickers.refresh(); market.refresh();void retryWorkspace().catch(()=>{}); }
  function changeExchange(next:ExchangeId) {
    if(next===exchange)return;
    updateWorkspace({exchange:next,selected:pair?.baseAsset||selected,selectedQuote:pair?.quoteAsset||selectedQuote,timeframe:nearestTimeframe(next,timeframe)});
  }

  const marketColumn=marketsOpen&&marketPanel.mode!=="floating",tradeColumn=tradesOpen&&!!pair&&tradesDocked&&wide;
  const markets=marketsOpen?<MarketsPanel inColumn={marketColumn} exchange={exchange} pairs={list} total={pairs.data?.length} selected={pair?.symbol} tickers={tickerMap} ticks={tickers.status==="live"?tickers.ticks:undefined}
        search={search} setSearch={setSearch} quote={listQuote} currencies={currencies} catalogReady={!!catalog.data}
        setQuote={value=>updateWorkspace({quote:value,selected:pair?.baseAsset||selected,selectedQuote:value==="all"?pair?.quoteAsset||selectedQuote:value})}
        sort={effectiveSort} setSort={setSort} statsReady={statsReady} volumeAvailable={volumeAvailable} changeAvailable={changeAvailable}
        loading={listLoading} error={pairs.error} refresh={pairs.refresh} select={setSelected}/>:undefined;
  const trades=tradesOpen&&pair?<TradesPanel inColumn={tradeColumn} key={`trades:${session?.ownerId}:${pair.exchange}:${pair.symbol}`} pair={pair} trades={tickers.trades} status={tickers.status} connection={tickers.connection} demo={orders.data} error={orders.error}/>:undefined;
  const tapeSide=tradesSide==="auto"?(marketPanel.mode==="left"?"left":"right"):tradesSide;
  return <PanelDockProvider><div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Sinex broker — главная"><span className="brand-mark"><BrandMark size={24} /></span><span className="brand-name">Sinex<small>broker</small></span></Link>
      <div className="exchange-controls">
        <div className="exchange-tabs" role="group" aria-label="Биржи">{EXCHANGE_IDS.map(id => <button key={id} aria-pressed={exchange === id} onClick={() => changeExchange(id)}>{EXCHANGES[id].name}</button>)}</div>
        <select className="exchange-select" aria-label="Биржа" value={exchange} onChange={e => changeExchange(e.target.value as ExchangeId)}>{EXCHANGE_IDS.map(id => <option key={id} value={id}>{EXCHANGES[id].name}</option>)}</select>
      </div>
      <AccountButton />
    </header>
    <div className="workspace">
      {!marketColumn&&markets}
      {(["left","right"] as const).map(side=>(marketColumn&&marketPanel.mode===side||tradeColumn&&tapeSide===side)&&<TerminalSideColumn key={`column:${side}`} side={side} markets={marketColumn&&marketPanel.mode===side?markets:undefined} trades={tradeColumn&&tapeSide===side?trades:undefined}/>)}
      {orderBookOpen&&pair&&<OrderBookDialog key={`orderbook:${session?.ownerId}:${pair.exchange}:${pair.symbol}`} pair={pair} lastPrice={lastPrice} close={()=>setOrderBookOpen(false)}/>}
      {!tradeColumn&&trades}
      <main className="main-content">
        <section className="asset-header" aria-label="Выбранная пара">
          <div className="asset-identity"><button className="coin-info-trigger" onClick={()=>setCoinInfoOpen(true)} disabled={!pair} aria-label={`Информация о ${pair?.baseAsset||selected}`} title="Информация о монете"><CoinIcon asset={pair?.baseAsset || selected}/></button><div><div className="asset-name"><h1><button className="coin-name-trigger" onClick={()=>setCoinInfoOpen(true)} disabled={!pair} aria-label={`О монете ${pair?.baseAsset||selected}`}>{pair?.baseAsset || selected}<span>/{quote}</span></button></h1></div><p>{config.name} · Spot</p></div></div>
          <div className={`price-summary ${staleTicker ? "stale" : ""}`}>
            <div className="main-price"><span className="price-label">Последняя цена</span><div className="price-line"><strong>{price(lastPrice)}</strong><span>{quote}</span></div></div>
            <div className="price-stat change-stat"><span>Изменение · 24ч</span><strong className={change == null ? "muted" : change < 0 ? "negative" : "positive"}>{percent(change)}</strong></div>
            <div className="price-stat volume-stat" title={volume.hint}><span>Оборот · 24ч</span><strong>{volume.estimated?"≈ ":""}{compact(volume.value)} <small>USDT</small></strong></div>
          </div>
        </section>
        {error && <div className="error-banner" role="alert"><span title={error}>{error}</span><button onClick={refresh}>Повторить <RefreshCw size={12} /></button></div>}
        <section className="market-panel" aria-label="График выбранной пары">
          <div className="timeframe-toolbar">
            <div className="timeframe-buttons" role="group" aria-label="Интервал свечей">{availableTimeframes.map(tf => <button key={tf} title={intervalSpec(exchange,tf).computed?`${tf} · из часовых свечей`:tf==="1M"?"1 месяц":tf==="3M"?"3 месяца":tf} aria-pressed={timeframe === tf} className={timeframe === tf ? "active" : ""} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div>
            <select className="timeframe-select" aria-label="Интервал свечей" value={timeframe} onChange={event=>setTimeframe(event.target.value as Timeframe)}>{availableTimeframes.map(tf=><option key={tf} value={tf}>{tf}{tf.endsWith("M")?" · мес.":""}{intervalSpec(exchange,tf).computed?" · расчётный":""}</option>)}</select>
            <span className={`stream-pill ${live && !staleCandles ? "" : "waiting"}`} role="status" title={`${!live&&tradeConnected?"WebSocket подключён, новых сделок нет; ":""}Цена: ${live?"сделки WebSocket":"REST 5с"} · ${candleStream?"свечи WebSocket":"свечи REST 15с"} · статистика 24ч: REST 60с`}><span className="status-dot" /><span>{live && !staleCandles ? "Онлайн" : tradeConnected?"WS + REST · 5с":tickers.status === "connecting" ? "Подключение…" : "REST · 5с"}</span></span>
            <button className="button refresh-button" onClick={refresh} title="Обновить данные" aria-label="Обновить"><RefreshCw size={13} className={pairs.loading || tickers.loading || market.loading ? "spinning" : ""} /><span>Обновить</span></button>
            {!orderBookOpen&&<button className="button orderbook-button" disabled={!pair||!session} onClick={()=>setOrderBookOpen(true)} aria-label="Показать стакан" title="Показать стакан"><ListOrdered size={14}/><span>Стакан</span></button>}
            <button className="button demo-order-button" disabled={!pair||!session||!lastPrice} onClick={()=>pair&&lastPrice&&setOrderDraft({pair,price:lastPrice,side:"buy",type:"limit",ownerId:session?.ownerId})} title="Создать тестовую заявку" aria-label="Создать тестовую заявку">＋<span>Заявка</span></button>
            {!marketsOpen&&<button className="button markets-toggle-button" disabled={!session} onClick={()=>updateWorkspace({marketsOpen:true})} aria-label="Показать рынки" title="Показать список пар"><PanelRight size={14}/><span>Рынки</span></button>}
            {!tradesOpen&&<button className="button trades-toggle-button" disabled={!pair||!session} onClick={()=>updateWorkspace({tradesOpen:true})} aria-label="Показать сделки" title="Показать сделки"><Activity size={14}/><span>Сделки</span></button>}
          </div>
          <CandlestickChart fills={chartTrades.fills} tradesError={chartTrades.error} tradesTruncated={chartTrades.truncated} positions={orders.data?.account.portfolio?.positions||[]} onCancelOrder={o=>{void orders.request({action:"cancel",id:o.id}).catch(e=>window.alert(e instanceof Error?e.message:"Не удалось отменить заявку"));}} orders={orders.data?.orders||[]} onOrder={draft=>pair&&setOrderDraft({...draft,pair,ownerId:session?.ownerId})} tickPrice={lastPrice} key={`${exchange}:${pair?.symbol||selected}:${timeframe}`} preferences={preferences} history={market.history} exchange={exchange} exchangeName={config.name} candles={market.candles} symbol={pair?.symbol || selected} timeframe={timeframe} loading={market.loading} error={market.error || pairs.error} retry={refresh} />
        </section>
        <DemoOrdersPanel orders={orders}/>
      </main>
    </div>
    {coinInfoOpen&&pair&&<CoinInfoDialog key={`${pair.exchange}:${pair.symbol}`} pair={pair} ticker={ticker} lastPrice={lastPrice} usdtUsdRate={usdtUsdRate} close={()=>setCoinInfoOpen(false)}/>}
    {orderDraft&&orderDraft.ownerId===session?.ownerId&&<DemoOrderDialog key={`${session?.ownerId}:${orderDraft.pair.exchange}:${orderDraft.pair.symbol}`} pair={orderDraft.pair} draft={orderDraft} currentPrice={pair?.exchange===orderDraft.pair.exchange&&pair?.symbol===orderDraft.pair.symbol?lastPrice:undefined} orders={orders} close={()=>setOrderDraft(null)}/>}
  </div></PanelDockProvider>;
}
