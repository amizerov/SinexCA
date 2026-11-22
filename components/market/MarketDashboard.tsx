"use client";
import { useEffect, useMemo, useState,useCallback,useRef } from "react";
import Link from "next/link";
import { SlidersHorizontal, ListOrdered,PanelRight,Activity,CircleHelp } from "lucide-react";
import { useMarketResource } from "@/hooks/use-market-resource";
import { useMarketCandles } from "@/hooks/use-market-candles";
import { useMarketTickers } from "@/hooks/use-market-tickers";
import { CandlestickChart } from "./CandlestickChart";
import { CoinIcon } from "./CoinIcon";
import { CoinInfoDialog } from "./CoinInfoDialog";
import {FuturesParametersDialog} from "./FuturesParametersDialog";
import {SocketConnectionDialog} from "./SocketConnectionDialog";
import { OrderBookDialog } from "./OrderBookDialog";
import { MarketsPanel } from "./MarketsPanel";
import { BrandMark } from "./BrandMark";
import { EXCHANGES, EXCHANGE_IDS } from "@/lib/market/exchange-config";
import {marketTimeframes,marketTimeframe,marketIntervalSpec,hasFuturesCandleStream,supportsFutures} from "@/lib/market/market-type";
import { compact, coinNames, percent, price } from "@/lib/market/format";
import { type ExchangeId, type MarketType, type Timeframe, type TradingPair } from "@/lib/market/types";
import { wsInterval,shiftInterval } from "@/lib/market/intervals";
import { usePairOrder } from "@/hooks/use-pair-order";
import { AccountButton,useAccount } from "@/components/Account";
import { useIndicatorPreferences } from "@/hooks/use-indicator-preferences";
import { hasIndicators } from "@/lib/indicators/settings";
import {isVwapTimeframe} from "@/lib/indicators/vwap";
import {usdtVolume} from "@/lib/market/usdt-volume";
import {useMarketWorkspace} from "@/hooks/use-market-workspace";
import {quoteAssets,resolveQuote,filterQuote,selectedPair} from "@/lib/market/pair-selection";
import {useDemoOrders} from "@/hooks/use-demo-orders";
import {DemoOrderDialog,DemoOrdersPanel,type OrderDraft} from "./DemoTrading";
import {TradesPanel} from "./TradesPanel";
import {TerminalSideColumn} from "./TerminalSideColumn";
import {PanelDockProvider} from "./PanelDock";
import {useChartTrades} from "@/hooks/use-chart-trades";
import {useDockViewport,useMobileViewport} from "@/hooks/use-order-book-dock";
import {ThemeToggle} from "@/components/ThemeToggle";
import {TerminalLayoutsProvider,LayoutStatus} from "./TerminalLayouts";
import {useFloatingNotice} from "@/components/FloatingNotices";

import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {recordRecentPair} from "@/lib/ui/recent-pairs";
import {favoriteKey} from "@/lib/ui/market-panel-settings";

export function MarketDashboard() {
  const {session}=useAccount();
  const workspacePreferences=useWorkspacePreferences();
  const lastViewed=useRef("");
  const orders=useDemoOrders();
  const wide=useDockViewport();
  const mobile=useMobileViewport();
  const [orderDraft,setOrderDraft]=useState<(OrderDraft&{pair:TradingPair;ownerId:string|undefined})|null>(null);
  const [futuresParameters,setFuturesParameters]=useState<string>();
  const [socketIssue,setSocketIssue]=useState<{key:string;dismissed:boolean}>();
  const [connectionRevision,setConnectionRevision]=useState(0);
  const {workspace:{exchange,marketType,selected,quote:requestedQuote,selectedQuote,timeframe,orderBookOpen,marketsOpen,tradesOpen,marketPanel,tradesDocked,tradesSide},updateWorkspace,workspaceError,retryWorkspace}=useMarketWorkspace();
  const setSelected=useCallback((pair:TradingPair)=>{setFuturesParameters(undefined);updateWorkspace({selected:pair.baseAsset,selectedQuote:pair.quoteAsset});},[updateWorkspace]);
  const setTimeframe=(timeframe:Timeframe)=>updateWorkspace({timeframe});
  const setOrderBookOpen=(orderBookOpen:boolean)=>updateWorkspace({orderBookOpen});
  const config = EXCHANGES[exchange];
  const catalog = useMarketResource<TradingPair[]>(`/api/market/pairs?exchange=${exchange}&marketType=${marketType}&quote=all`);
  const listQuote=resolveQuote(catalog.data,exchange,requestedQuote);
  const currencies=useMemo(()=>quoteAssets(catalog.data||[]),[catalog.data]);
  const visiblePairs=useMemo(()=>catalog.data?filterQuote(catalog.data,listQuote):undefined,[catalog.data,listQuote]);
  const pairs={...catalog,data:visiblePairs};
  const [coinInfoOpen,setCoinInfoOpen]=useState(false);
  const availableTimeframes=marketTimeframes(exchange,marketType);
  const candleStream=marketType==="futures"?hasFuturesCandleStream(exchange):!!wsInterval(exchange,timeframe);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"volume" | "change" | "name">("volume");
  const [now, setNow] = useState<number>();
  const pair = selectedPair(pairs.data,selected,selectedQuote||config.quote);
  const workspacePair=useMemo<TradingPair>(()=>pair??{exchange,marketType,symbol:"",baseAsset:selected,quoteAsset:selectedQuote||config.quote},[pair,exchange,marketType,selected,selectedQuote,config.quote]);
  const quote = pair?.quoteAsset||(listQuote==="all"?config.quote:listQuote);
  const preferences=useIndicatorPreferences(session?.ownerId,pair?{exchange,marketType,symbol:pair.symbol}:undefined);
  const tickers = useMarketTickers(exchange,pairs.data,pair,listQuote,marketType);
  const tickerMap = useMemo(() => new Map(tickers.data?.map(t => [t.symbol, t])), [tickers.data]);
  const statsReady=!!pairs.data&&!tickers.loading;
  const volumeAvailable=listQuote!=="all"&&!!tickers.data?.some(t=>t.quoteVolume24h!=null);
  const changeAvailable=!!tickers.data?.some(t=>t.priceChangePercent24h!=null);
  const effectiveSort=statsReady&&((sort==="volume"&&!volumeAvailable)||(sort==="change"&&!changeAvailable))?"name":sort;
  const listLoading=!pairs.data?pairs.loading:sort!=="name"&&!statsReady;
  const orderedPairs=usePairOrder(`${exchange}:${marketType}`,pairs.data,tickerMap,effectiveSort,!listLoading);
  const ticker = pair ? tickerMap.get(pair.symbol) : undefined;
  const market = useMarketCandles(exchange, pair, timeframe,hasIndicators(preferences.settings),preferences.settings.vwap.enabled&&isVwapTimeframe(timeframe));
  useEffect(()=>{
    if(!workspacePreferences.ready||!pair||market.loading||!market.candles.length)return;
    const key=workspacePreferences.identity?.ownerId+":"+favoriteKey(pair);
    if(lastViewed.current===key)return;
    lastViewed.current=key;
    workspacePreferences.update({recentPairs:recordRecentPair(workspacePreferences.settings.recentPairs,pair)});
  },[pair,market.loading,market.candles.length,workspacePreferences]);
  function openSavedPair(saved:TradingPair){
    setSearch("");
    updateWorkspace({exchange:saved.exchange,marketType:saved.marketType,quote:saved.quoteAsset,selected:saved.baseAsset,selectedQuote:saved.quoteAsset,timeframe:marketTimeframe(saved.exchange,saved.marketType,timeframe)});
  }
  const list = useMemo(() => {
    return orderedPairs.filter(p => `${p.baseAsset} ${p.symbol} ${coinNames[p.baseAsset] || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  }, [orderedPairs, search]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const latestCandle = market.candles.at(-1);
  const chartTrades=useChartTrades(exchange,marketType==="spot"?pair?.symbol:undefined,market.candles[0]?.time,latestCandle?shiftInterval(latestCandle.time,timeframe,1):undefined);
  const trade=pair&&tickers.status==="live"?tickers.ticks?.get(pair.symbol):undefined;
  const lastPrice = trade?.price??ticker?.lastPrice??market.livePrice??latestCandle?.close;
  const conversionSymbol=catalog.data?.find(p=>p.baseAsset==="USDT"&&p.quoteAsset==="USD")?.symbol;
  const usdtUsdRate=conversionSymbol?tickerMap.get(conversionSymbol)?.lastPrice:undefined;
  const usdFutures=marketType==="futures"&&pair?.quoteAsset==="USD";
  const volume=usdFutures?{value:ticker?.quoteVolume24h??(ticker?.baseVolume24h!=null&&lastPrice!=null?ticker.baseVolume24h*lastPrice:null),estimated:ticker?.quoteVolume24h==null,hint:"Оборот за 24 часа в USD"}:usdtVolume(pair,ticker,lastPrice,usdtUsdRate);
  const live = tickers.status === "live";
  const tradeConnected=!!tickers.connection?.connected&&!!tickers.connection?.subscribed;
  const staleTicker = !!ticker && !!now && now - ticker.receivedAt > 20_000;
  const staleCandles = !tickers.lastStreamAt || (!!now && now - tickers.lastStreamAt > 20000);
  const error = workspaceError || pairs.error || tickers.error || market.error;
  const change = ticker?.priceChangePercent24h;
  function refresh() { pairs.refresh(); tickers.refresh(); market.refresh();setConnectionRevision(value=>value+1);void retryWorkspace().catch(()=>{}); }
  const contractKey=pair?JSON.stringify([workspacePreferences.identity?.ownerId,exchange,marketType,pair.symbol]):"";
  const socketKey=`${exchange}:${marketType}:${pair?.symbol??""}:${timeframe}`;
  const socketDisconnected=!!pair&&((!tickers.connection?.connected&&(tickers.status==="offline"||tickers.status==="reconnecting"))||(candleStream&&(market.status==="offline"||market.status==="reconnecting")));
  const socketOffline=tickers.status==="offline"||candleStream&&market.status==="offline";
  useEffect(()=>{
    const timer=setTimeout(()=>{if(!socketDisconnected)setSocketIssue(undefined);else setSocketIssue(old=>old?.key===socketKey?old:{key:socketKey,dismissed:false});},!socketDisconnected||socketOffline?0:6000);
    return()=>clearTimeout(timer);
  },[socketKey,socketDisconnected,socketOffline]);
  useFloatingNotice("market-data",error,{actionLabel:"Повторить",action:refresh});
  function changeExchange(next:ExchangeId) {
    if(next===exchange)return;
    updateWorkspace({exchange:next,selected:pair?.baseAsset||selected,selectedQuote:pair?.quoteAsset||selectedQuote,timeframe:marketTimeframe(next,marketType,timeframe)});
  }

  function changeMarketType(next:MarketType){
    if(next===marketType)return;
    const nextExchange=next==="futures"&&!supportsFutures(exchange)?"binance":exchange;
    setSearch("");setOrderDraft(null);setCoinInfoOpen(false);setFuturesParameters(undefined);
    updateWorkspace({marketType:next,exchange:nextExchange,quote:next==="futures"?"USDT":requestedQuote,selectedQuote:next==="futures"?"USDT":selectedQuote,timeframe:marketTimeframe(nextExchange,next,timeframe)});
  }
  const showOrderBook=orderBookOpen&&!mobile,showTrades=tradesOpen&&!mobile;
  const marketColumn=marketsOpen&&marketPanel.mode!=="floating",tradeColumn=showTrades&&tradesDocked&&wide;
  const markets=marketsOpen?<MarketsPanel inColumn={marketColumn} exchange={exchange} pairs={list} total={pairs.data?.length} selected={pair?.symbol} tickers={tickerMap} ticks={tickers.status==="live"?tickers.ticks:undefined}
        search={search} setSearch={setSearch} quote={listQuote} currencies={currencies} catalogReady={!!catalog.data}
        setQuote={value=>updateWorkspace({quote:value,selected:pair?.baseAsset||selected,selectedQuote:value==="all"?pair?.quoteAsset||selectedQuote:value})}
        sort={effectiveSort} setSort={setSort} statsReady={statsReady} volumeAvailable={volumeAvailable} changeAvailable={changeAvailable}
        loading={listLoading} error={pairs.error} select={setSelected} openSavedPair={openSavedPair}/>:undefined;
  const trades=showTrades?<TradesPanel inColumn={tradeColumn} key={`trades:${session?.ownerId??"guest"}:${workspacePair.exchange}:${workspacePair.marketType}:${workspacePair.baseAsset}:${workspacePair.quoteAsset}`} pair={workspacePair} pending={!pair} trades={pair?tickers.trades:[]} status={pair?tickers.status:"connecting"} connection={pair?tickers.connection:undefined} demo={marketType==="spot"?orders.data:undefined} error={orders.error}/>:undefined;
  const tapeSide=tradesSide==="auto"?(marketPanel.mode==="left"?"left":"right"):tradesSide;
  return <TerminalLayoutsProvider key={session?.ownerId||"guest"} indicators={preferences.document}><PanelDockProvider><div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Sinex — главная"><span className="brand-mark"><BrandMark size={24} /></span><span className="brand-name">Sinex<small>terminal</small></span></Link>
      <div className="market-type-switch" role="group" aria-label="Тип рынка"><button disabled={!workspacePreferences.ready} aria-pressed={marketType==="spot"} onClick={()=>changeMarketType("spot")}>Спот</button><button disabled={!workspacePreferences.ready} aria-pressed={marketType==="futures"} onClick={()=>changeMarketType("futures")}>Фьючерсы</button></div>
      <div className="exchange-controls">
        <div className="exchange-tabs" role="group" aria-label="Биржи">{EXCHANGE_IDS.map(id => <button key={id} disabled={marketType==="futures"&&!supportsFutures(id)} title={marketType==="futures"&&!supportsFutures(id)?"Фьючерсы этой биржи пока недоступны":undefined} aria-pressed={exchange === id} onClick={() => changeExchange(id)}>{EXCHANGES[id].name}</button>)}</div>
        <select className="exchange-select" aria-label="Биржа" value={exchange} onChange={e => changeExchange(e.target.value as ExchangeId)}>{EXCHANGE_IDS.map(id => <option key={id} value={id} disabled={marketType==="futures"&&!supportsFutures(id)}>{EXCHANGES[id].name}</option>)}</select>
      </div>
      <ThemeToggle />
      <Link href="/prices" className="help-link" title="Цены на биржах" aria-label="Сравнить цены на биржах">⇄</Link>
      <Link href="/help" className="help-link" title="Справка и обучение" aria-label="Открыть справку"><CircleHelp size={17}/></Link>
      <AccountButton />
    </header>
    <div className="workspace">
      {!marketColumn&&markets}
      {(["left","right"] as const).map(side=>(marketColumn&&marketPanel.mode===side||tradeColumn&&tapeSide===side)&&<TerminalSideColumn key={`column:${side}`} side={side} markets={marketColumn&&marketPanel.mode===side?markets:undefined} trades={tradeColumn&&tapeSide===side?trades:undefined}/>)}
      {showOrderBook&&<OrderBookDialog key={`orderbook:${connectionRevision}:${session?.ownerId??"guest"}:${workspacePair.exchange}:${workspacePair.marketType}:${workspacePair.baseAsset}:${workspacePair.quoteAsset}`} pair={workspacePair} pending={!pair} lastPrice={lastPrice} close={()=>setOrderBookOpen(false)}/>}
      {!tradeColumn&&trades}
      <main className="main-content">
        <section className="asset-header" aria-label="Выбранная пара">
          <div className="asset-identity"><button className="coin-info-trigger" onClick={()=>setCoinInfoOpen(true)} disabled={!pair} aria-label={`Информация о ${pair?.baseAsset||selected}`} title="Информация о монете"><CoinIcon asset={pair?.baseAsset || selected}/></button><div><div className="asset-name"><h1><button className="coin-name-trigger" onClick={()=>setCoinInfoOpen(true)} disabled={!pair} aria-label={`О монете ${pair?.baseAsset||selected}`}>{pair?.baseAsset || selected}<span>/{quote}</span></button></h1></div><p>{config.name} · {marketType==="futures"?`Фьючерсы · ${quote} Perpetual`:"Spot"}</p></div></div>
          <div className={`price-summary ${staleTicker ? "stale" : ""}`}>
            <div className="main-price"><span className="price-label">Последняя цена</span><div className="price-line"><strong>{price(lastPrice)}</strong><span>{quote}</span></div></div>
            <div className="price-stat change-stat"><span>Изменение · 24ч</span><strong className={change == null ? "muted" : change < 0 ? "negative" : "positive"}>{percent(change)}</strong></div>
            <div className="price-stat volume-stat" title={volume.hint}><span>Оборот · 24ч</span><strong>{volume.estimated?"≈ ":""}{compact(volume.value)} <small>{usdFutures?"USD":"USDT"}</small></strong></div>
          </div>
        </section>
        <section className="market-panel" aria-label="График выбранной пары">
          <div className="timeframe-toolbar">
            <div className="timeframe-buttons" role="group" aria-label="Интервал свечей">{availableTimeframes.map(tf => <button key={tf} title={marketIntervalSpec(exchange,marketType,tf).computed?`${tf} · из часовых свечей`:tf==="1M"?"1 месяц":tf==="3M"?"3 месяца":tf} aria-pressed={timeframe === tf} className={timeframe === tf ? "active" : ""} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div>
            <select className="timeframe-select" aria-label="Интервал свечей" value={timeframe} onChange={event=>setTimeframe(event.target.value as Timeframe)}>{availableTimeframes.map(tf=><option key={tf} value={tf}>{tf}{tf.endsWith("M")?" · мес.":""}{marketIntervalSpec(exchange,marketType,tf).computed?" · расчётный":""}</option>)}</select>
            <span className={`stream-pill ${live && !staleCandles ? "" : "waiting"}`} role="status" title={`${!live&&tradeConnected?"WebSocket подключён, новых сделок нет; ":""}Цена: ${live?"сделки WebSocket":"REST 5с"} · ${candleStream?"свечи WebSocket":"свечи REST 15с"} · статистика 24ч: REST 60с`}><span className="status-dot" /><span>{live && !staleCandles ? "Онлайн" : tradeConnected?"WS + REST · 5с":tickers.status === "connecting" ? "Подключение…" : "REST · 5с"}</span></span>
            {marketType==="futures"&&<button className="button futures-parameters-button" disabled={!pair||!workspacePreferences.ready} onClick={()=>setFuturesParameters(contractKey)} title="Параметры фьючерса" aria-label="Параметры фьючерса" aria-haspopup="dialog"><SlidersHorizontal size={14}/><span>Параметры фьючерса</span></button>}
            {!mobile&&!orderBookOpen&&<button className="button orderbook-button" disabled={!pair} onClick={()=>setOrderBookOpen(true)} aria-label="Показать стакан" title="Показать стакан"><ListOrdered size={14}/><span>Стакан</span></button>}
            <button className="button demo-order-button" disabled={marketType==="futures"||!pair||!session||!lastPrice} onClick={()=>pair&&lastPrice&&setOrderDraft({pair,price:lastPrice,side:"buy",type:"limit",ownerId:session?.ownerId})} title="Создать тестовую заявку" aria-label="Создать тестовую заявку">＋<span>Заявка</span></button>
            {!marketsOpen&&<button className="button markets-toggle-button" onClick={()=>updateWorkspace({marketsOpen:true})} aria-label="Показать рынки" title="Показать список пар"><PanelRight size={14}/><span>Рынки</span></button>}
            {!mobile&&!tradesOpen&&<button className="button trades-toggle-button" disabled={!pair} onClick={()=>updateWorkspace({tradesOpen:true})} aria-label="Показать сделки" title="Показать сделки"><Activity size={14}/><span>Сделки</span></button>}
          </div>
          <CandlestickChart marketType={marketType} contractSize={pair?.contractSize} quoteAsset={pair?.quoteAsset} fills={marketType==="spot"?chartTrades.fills:[]} tradesError={chartTrades.error} tradesTruncated={chartTrades.truncated} positions={marketType==="spot"?orders.data?.account.portfolio?.positions||[]:[]} orders={marketType==="spot"?orders.data?.orders||[]:[]} onOrder={marketType==="spot"?draft=>pair&&setOrderDraft({...draft,pair,ownerId:session?.ownerId}):undefined} tickPrice={lastPrice} key={`${workspacePreferences.settings.layoutGeneration}:${exchange}:${marketType}:${pair?.symbol||selected}:${timeframe}`} preferences={preferences} history={market.history} exchange={exchange} exchangeName={config.name} candles={market.candles} symbol={pair?.symbol || selected} timeframe={timeframe} loading={market.loading} error={market.error || pairs.error} />
        </section>
        {marketType==="spot"&&<DemoOrdersPanel orders={orders} onSelect={order=>{setSearch("");updateWorkspace({exchange:order.exchange,marketType:"spot",selected:order.base,selectedQuote:order.quote,quote:order.quote,timeframe:marketTimeframe(order.exchange,"spot",timeframe)});}}/>}
      </main>
    </div>
    {futuresParameters===contractKey&&pair&&marketType==="futures"&&<FuturesParametersDialog key={contractKey} pair={pair} ownerId={workspacePreferences.identity?.ownerId??"guest"} close={()=>setFuturesParameters(undefined)}/>}
    {socketDisconnected&&socketIssue?.key===socketKey&&!socketIssue.dismissed&&<SocketConnectionDialog exchange={config.name} pair={`${pair?.baseAsset}/${quote}`} refresh={refresh} close={()=>setSocketIssue({key:socketKey,dismissed:true})}/>}
    {coinInfoOpen&&pair&&<CoinInfoDialog key={`${pair.exchange}:${pair.symbol}`} pair={pair} ticker={ticker} lastPrice={lastPrice} usdtUsdRate={usdtUsdRate} close={()=>setCoinInfoOpen(false)}/>}
    {orderDraft&&orderDraft.ownerId===session?.ownerId&&<DemoOrderDialog key={`${session?.ownerId}:${orderDraft.pair.exchange}:${orderDraft.pair.symbol}`} pair={orderDraft.pair} draft={orderDraft} currentPrice={pair?.exchange===orderDraft.pair.exchange&&pair?.symbol===orderDraft.pair.symbol?lastPrice:undefined} orders={orders} close={()=>setOrderDraft(null)}/>}
    <footer className="terminal-footer">
      <span>Sinex — криптовалютный терминал</span>
      <nav aria-label="Основные разделы"><Link href="/prices">Цены на биржах</Link><Link href="/help">Справка</Link><Link href="/learn">Обучение</Link><Link href="/developers">Разработчикам</Link><Link href="/blog">Блог</Link><Link href="/about">О проекте</Link></nav>
      <LayoutStatus/>
    </footer>
  </div></PanelDockProvider></TerminalLayoutsProvider>;
}
