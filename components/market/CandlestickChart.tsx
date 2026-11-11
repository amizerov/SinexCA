"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {createPortal} from "react-dom";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode,LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp,type IPriceLine } from "lightweight-charts";
import { Expand, Minimize, ScanLine, BarChart3,SlidersHorizontal,MapPin } from "lucide-react";
import type { Candle, ExchangeId, Timeframe } from "@/lib/market/types";
import { ChartDrawings } from "./ChartDrawings";
import { useAccount } from "@/components/Account";
import { price, compact } from "@/lib/market/format";
import { IndicatorDialog } from "./IndicatorDialog";
import type { useIndicatorPreferences } from "@/hooks/use-indicator-preferences";
import { useChartIndicators } from "@/hooks/use-chart-indicators";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { chartTimeFormatters } from "@/lib/market/chart-time";
import {type DemoOrder,type DemoFill} from "@/lib/paper/orders";
import type {OrderDraft} from "./DemoTrading";
import type {PaperPosition} from "@/lib/paper/portfolio";
import {useExecutionMarkers} from "@/hooks/use-execution-markers";
import {ExecutionTooltip} from "./ExecutionTooltip";
import {CURRENT_PRICE_COLOR,orderColor,orderLevels} from "@/lib/paper/order-levels";
import {DemoOrderMarkers} from "./DemoOrderMarkers";

interface Props { fills?:DemoFill[];positions?:PaperPosition[];tradesError?:string;tradesTruncated?:boolean;orders?:DemoOrder[];onOrder?:(draft:OrderDraft)=>void;tickPrice?:number;preferences:ReturnType<typeof useIndicatorPreferences>;history:Candle[];candles: Candle[]; exchange: ExchangeId; exchangeName: string; symbol: string; timeframe: Timeframe; loading: boolean; error?: string; retry: () => void }
export function CandlestickChart({ fills=[],positions=[],tradesError,tradesTruncated,orders,onOrder,tickPrice,preferences,history,candles, exchange, exchangeName, symbol, timeframe, loading, error, retry }: Props) {
  const {session}=useAccount();
  const timeZone=useBrowserTimeZone();
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const tradeLine=useRef<IPriceLine|null>(null);
  const previous = useRef<{ key: string; candles: Candle[] } | null>(null);
  const needsViewport=useRef(true);
  const [expanded, setExpanded] = useState(false);
  const [showTrades,setShowTrades]=useState(true);
  const [context,setContext]=useState<{x:number;y:number;price:number}>();
  useEffect(()=>{if(!context)return;const close=()=>setContext(undefined);window.addEventListener("pointerdown",close);window.addEventListener("keydown",close);return()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("keydown",close);};},[context]);
  const activeOrders=useMemo(()=>(orders||[]).filter(o=>o.exchange===exchange&&o.symbol===symbol),[orders,exchange,symbol]);
  const pendingLevels=useMemo(()=>orderLevels(activeOrders),[activeOrders]);

  const showVolume=preferences.settings.volume;
  const [indicatorDialog,setIndicatorDialog]=useState(false);
  const indicatorNames=[...preferences.settings.ema.filter(line=>line.enabled).map(line=>`EMA ${line.period}`),...preferences.settings.sma.enabled?[`SMA ${preferences.settings.sma.period}`]:[],...preferences.settings.rsi.enabled?[`RSI ${preferences.settings.rsi.period}`]:[]];
  const count=indicatorNames.length;
  const [hovered, setHovered] = useState<{ exchangeName: string; symbol: string; timeframe: Timeframe; candle: Candle }>();
  const datasetRef = useRef({ candles, exchangeName, symbol, timeframe });
  useEffect(() => { datasetRef.current = { candles, exchangeName, symbol, timeframe }; }, [candles, exchangeName, symbol, timeframe]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  useEffect(() => {
    if (!container.current) return;
    let disposed=false;
    const colors=()=>document.documentElement.dataset.theme==="light"
      ? {background:"#ffffff",text:"#66756a",grid:"#e7ece6",crosshair:"#809184",crosshairLabel:"#607367",border:"#d5ded4"}
      : {background:"#111614",text:"#7c8981",grid:"#1b231f",crosshair:"#6e8474",crosshairLabel:"#35443a",border:"#252e28"};
    const initial=colors();
    const instance = createChart(container.current, {
      layout: { background: { type: ColorType.Solid, color: initial.background }, textColor: initial.text, fontFamily: "'Segoe UI', sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: initial.grid }, horzLines: { color: initial.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: initial.crosshair, labelBackgroundColor: initial.crosshairLabel }, horzLine: { color: initial.crosshair, labelBackgroundColor: initial.crosshairLabel } },
      rightPriceScale: { borderColor: initial.border, minimumWidth: 82 },
      timeScale: { borderColor: initial.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      localization: { locale: "ru-RU" },
    });
    chart.current = instance;
    const syncTheme=()=>{const next=colors();instance.applyOptions({layout:{background:{type:ColorType.Solid,color:next.background},textColor:next.text},grid:{vertLines:{color:next.grid},horzLines:{color:next.grid}},crosshair:{vertLine:{color:next.crosshair,labelBackgroundColor:next.crosshairLabel},horzLine:{color:next.crosshair,labelBackgroundColor:next.crosshairLabel}},rightPriceScale:{borderColor:next.border},timeScale:{borderColor:next.border}});};
    window.addEventListener("sinex:theme-change",syncTheme);
    needsViewport.current=true;
    series.current = instance.addSeries(CandlestickSeries, { upColor: "#9bd67a", downColor: "#ec7775", borderVisible: false, wickUpColor: "#9bd67a", wickDownColor: "#ec7775", priceLineColor:CURRENT_PRICE_COLOR,priceLineVisible:false,lastValueVisible:false });
    volume.current = instance.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false }, 1);
    instance.panes()[0].setStretchFactor(5);
    instance.panes()[1].setStretchFactor(1);
    instance.subscribeCrosshairMove(event => {
      if(disposed)return;
      if (!event.time || !series.current) { setHovered(undefined); return; }
      const data = event.seriesData.get(series.current);
      if (data && "open" in data) {
        const current = datasetRef.current;
        const candle = current.candles.find(c => c.time === Number(event.time));
        if (candle) setHovered({ exchangeName: current.exchangeName, symbol: current.symbol, timeframe: current.timeframe, candle });
      }
    });
    const observer = new ResizeObserver(entries => {
      if(disposed||chart.current!==instance)return;
      const rect = entries[0]?.contentRect;
      if (rect) { instance.resize(Math.floor(rect.width), Math.floor(rect.height)); container.current?.dispatchEvent(new Event("sinex:chart-layout", { bubbles: true })); }
    });
    observer.observe(container.current);
    return () => { disposed=true;window.removeEventListener("sinex:theme-change",syncTheme);observer.disconnect();if(chart.current===instance){chart.current=null;series.current=null;volume.current=null;previous.current=null;tradeLine.current=null;}instance.remove(); };
  }, []);

  useEffect(() => {
    if (!series.current || !chart.current) return;
    const key = `${exchangeName}:${symbol}:${timeframe}`;
    const old = previous.current;
    const last = candles.at(-1);
    const sameHistory = old?.key === key && old.candles.length === candles.length && old.candles.slice(0, -1).every((c, i) => c === candles[i]);
    const candlePoint = (c: Candle) => ({ ...c, time: c.time as UTCTimestamp });
    const volumePoint = (c: Candle) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "#89c66c55" : "#ec77754d" });
    if (last && sameHistory && old?.candles.length) {
      series.current.update(candlePoint(last)); volume.current?.update(volumePoint(last));
    } else {
      series.current.setData(candles.map(candlePoint)); volume.current?.setData(candles.map(volumePoint));
    }
    if (last) {
      const precision = last.close >= 1 ? 2 : Math.min(8, Math.max(4, Math.ceil(-Math.log10(last.close)) + 3));
      series.current.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
    }
    previous.current = { key, candles };
    container.current?.dispatchEvent(new Event("sinex:chart-layout", { bubbles: true }));
  }, [candles, exchangeName, symbol, timeframe]);
  useEffect(()=>{
    const source=series.current;if(!source)return;const attached=()=>series.current===source;
    const lines=[...new Map(pendingLevels.map(level=>[level.price,level.order.side])).entries()].map(([value,side])=>source.createPriceLine({price:value,color:orderColor(side),lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,axisLabelColor:"#142019",axisLabelTextColor:orderColor(side),title:""}));
    return()=>{if(attached())for(const line of lines)source.removePriceLine(line);};
  },[pendingLevels]);


  useEffect(() => {
    const instance=chart.current;if(!instance)return;
    if(!showVolume&&volume.current){instance.removeSeries(volume.current);volume.current=null;}
    else if(showVolume&&!volume.current){volume.current=instance.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"volume",lastValueVisible:false,priceLineVisible:false},instance.panes().length);volume.current.setData(datasetRef.current.candles.map(c=>({time:c.time as UTCTimestamp,value:c.volume,color:c.close>=c.open?"#89c66c55":"#ec77754d"})));}
    volume.current?.getPane().setStretchFactor(1);
    container.current?.dispatchEvent(new Event("sinex:chart-layout", { bubbles: true }));
  }, [showVolume]);
  useChartIndicators(chart,history,candles,preferences.settings,container);
  useEffect(()=>{
    const source=series.current;if(!source)return;
    source.applyOptions({lastValueVisible:false,priceLineVisible:false});
    const currentPrice=tickPrice??candles.at(-1)?.close;
    if(currentPrice===undefined){if(tradeLine.current){source.removePriceLine(tradeLine.current);tradeLine.current=null;}return;}
    const options={price:currentPrice,color:CURRENT_PRICE_COLOR,axisLabelColor:CURRENT_PRICE_COLOR,axisLabelTextColor:"#10232c",lineWidth:1 as const,lineStyle:LineStyle.Dotted,axisLabelVisible:true,title:""};
    if(tradeLine.current)tradeLine.current.applyOptions(options);else tradeLine.current=source.createPriceLine(options);
  },[tickPrice,candles]);
  useEffect(()=>{
    const seconds=timeframe.endsWith("s");
    const formatters=chartTimeFormatters(timeZone,seconds);
    chart.current?.applyOptions({
      timeScale:{secondsVisible:seconds,tickMarkFormatter:formatters.tickMarkFormatter},
      localization:{timeFormatter:formatters.timeFormatter},
    });
  },[timeframe,timeZone]);
  useEffect(()=>{
    if(!candles.length||!needsViewport.current)return;
    // Set the range after candle and indicator series have all rebuilt the time scale.
    const frame=requestAnimationFrame(()=>{const instance=chart.current;if(!instance)return;instance.priceScale("right",0).applyOptions({autoScale:true});instance.timeScale().setVisibleLogicalRange({from:Math.max(0,candles.length-95),to:candles.length+5});needsViewport.current=false;container.current?.dispatchEvent(new Event("sinex:chart-layout",{bubbles:true}));});
    return()=>cancelAnimationFrame(frame);
  },[candles]);

  const executions=useExecutionMarkers(chart,series,fills,candles,exchange,symbol,timeframe,positions,showTrades);
  const basisChange=executions.breakEven&&tickPrice!==undefined?(tickPrice/executions.breakEven-1)*100:undefined;
  const legend = hovered?.exchangeName === exchangeName && hovered.symbol === symbol && hovered.timeframe === timeframe ? hovered.candle : candles.at(-1);
  return <div className={`chart-block ${expanded ? "expanded" : ""}`}>
    <div className="chart-tools">
    <div className="ohlc"><span>O <b>{price(legend?.open)}</b></span><span>H <b>{price(legend?.high)}</b></span><span>L <b>{price(legend?.low)}</b></span><span>C <b className={legend && legend.close >= legend.open ? "positive" : "negative"}>{price(legend?.close)}</b></span><span className="ohlc-volume">Объём <b>{compact(legend?.volume)}</b></span></div>
      <div className="chart-actions">
        {(fills.length>0||executions.average!==undefined||tradesError)&&<button className={`icon-button ${showTrades?"selected":""}`} aria-label="Показать или скрыть мои сделки" aria-pressed={showTrades} title={tradesError||`Мои исполнения · ${executions.grouped.markers.length} меток${tradesTruncated?" · история ограничена 10 000 исполнений":""}`} onClick={()=>setShowTrades(v=>!v)}><MapPin size={15}/></button>}
        <button className={`icon-button indicator-open ${count?"selected":""}`} aria-label="Индикаторы" title={preferences.error||`${indicatorNames.join(", ")||"Выбрать индикаторы"} · ${Object.values(preferences.forAll).every(Boolean)?"общие настройки":"есть настройки только для этой пары"}`} onClick={()=>setIndicatorDialog(true)}><SlidersHorizontal size={15}/><span>Индикаторы</span>{count>0&&<b>{count}</b>}</button>
        <button className={`icon-button ${showVolume ? "selected" : ""}`} title="Показать или скрыть объём" aria-label="Показать или скрыть объём" aria-pressed={showVolume} disabled={!preferences.ready||preferences.busy} onClick={() => void preferences.save({...preferences.settings,volume:!showVolume})}><BarChart3 size={16} /></button>
        <button className="icon-button" title="Показать всю историю" aria-label="Показать всю историю" onClick={() => chart.current?.timeScale().fitContent()}><ScanLine size={16} /></button>
        <button className="icon-button" title={expanded ? "Свернуть график" : "Увеличить график"} aria-label={expanded ? "Свернуть график" : "Увеличить график"} aria-pressed={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <Minimize size={16} /> : <Expand size={16} />}</button>
      </div>
    </div>
    {indicatorDialog&&<IndicatorDialog key={`${session?.ownerId||"guest"}:${preferences.ready}`} preferences={preferences} close={()=>setIndicatorDialog(false)}/>}
    <span className="sr-only" data-preferences-status={preferences.busy?"saving":"saved"}/>
    <div className="chart-canvas-wrap" onContextMenu={e=>{if(!onOrder||!series.current||!container.current||!candles.length)return;if((e.target as HTMLElement).closest("button,input,[data-drawing-id]"))return;const rect=container.current.getBoundingClientRect(),y=e.clientY-rect.top;if(y<0||y>(chart.current?.panes()[0]?.getHeight()??0))return;const p=series.current.coordinateToPrice(y);if(p===null||p<=0)return;e.preventDefault();setContext({x:Math.max(4,Math.min(e.clientX,window.innerWidth-245)),y:Math.max(4,Math.min(e.clientY,window.innerHeight-185)),price:Number(p.toPrecision(10))});}}>
      <div ref={container} className="chart-canvas" aria-label={`Свечной график ${symbol}, интервал ${timeframe}, время ${timeZone}`} role="img" />
      <span className="sr-only" data-execution-count={showTrades?executions.grouped.markers.length:0}>{showTrades?executions.grouped.markers.map(t=>`${t.side==="buy"?"Покупка":"Продажа"}: ${t.quantity} ${t.base}, цена ${t.price} ${t.quote}`).join("; "):"Метки сделок скрыты"}</span>
      {showTrades&&executions.tooltip&&<ExecutionTooltip {...executions.tooltip}/>}
      {showTrades&&executions.average!==undefined&&<div className="chart-entry-summary" data-entry-price={executions.average} title="Средняя себестоимость остатка с комиссией покупки. Пунктир — ориентир безубыточности с DEMO-комиссией продажи 0,1%. Процент сравнивает текущую цену с этим ориентиром, без оценки глубины стакана."><span>Вход {new Intl.NumberFormat("ru-RU",{maximumFractionDigits:8}).format(executions.average)} {executions.quote}</span>{basisChange!==undefined&&<strong className={basisChange>=0?"positive":"negative"}>{basisChange>0?"+":""}{basisChange.toFixed(2)}%</strong>}</div>}
      {showTrades&&(tradesError||tradesTruncated||executions.grouped.outside>0)&&<span className="chart-trades-warning" role="status">{tradesError||(tradesTruncated?"Показаны последние 10 000 исполнений диапазона":`${executions.grouped.outside} исполнений без свечи в истории`)}</span>}
      {onOrder&&<DemoOrderMarkers chart={chart} series={series} container={container} orders={activeOrders} onInspect={order=>onOrder({order,price:order.limit??order.stop??tickPrice??1,side:order.side,type:order.type})}/>}
      {context&&createPortal(<div className="demo-chart-menu" role="menu" aria-label="Действия с ценой" style={{left:context.x,top:context.y}} onPointerDown={e=>e.stopPropagation()}>{(["buy","sell"] as const).map(side=><button role="menuitem" key={side} onClick={()=>{onOrder?.({side,price:context.price,type:"limit"});setContext(undefined);}}>{side==="buy"?"Купить":"Продать"} · Лимит</button>)}<button role="menuitem" onClick={()=>{onOrder?.({side:"buy",price:context.price,type:"stop_limit"});setContext(undefined);}}>Новая стоп-заявка…</button><button role="menuitem" onClick={()=>{void navigator.clipboard?.writeText(String(context.price));setContext(undefined);}}>Копировать цену</button></div>,document.body)}
      {session&&<ChartDrawings key={`${session.ownerId}:${exchange}:spot:${symbol}`} ownerId={session.ownerId} scope={{ exchange, marketType: "spot", symbol }} chart={chart} series={series} candles={candles} />}
      {!candles.length && <div className="chart-overlay" role="status">{loading ? <><span className="loader" /><strong>Загружаем историю рынка</strong><span>История {exchangeName} Spot</span></> : <><strong>{error ? "Данные пока недоступны" : "Выберите торговую пару"}</strong>{error && <><span>{error}</span><button className="button" onClick={retry}>Повторить загрузку</button></>}</>}</div>}
    </div>
    <div className="chart-caption"><span title="Локальное время браузера. Начало и закрытие свечей определяет биржа.">Время: {timeZone} <span className="separator">/</span> {candles.length ? `${candles.length} свечей` : "Ожидание данных"}</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Графики TradingView ↗</a></div>
  </div>;
}
