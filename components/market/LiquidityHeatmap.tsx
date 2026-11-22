"use client";
import {useEffect,useMemo,useRef,useState,type RefObject} from "react";
import type {IChartApi,ISeriesApi,UTCTimestamp} from "lightweight-charts";
import type {Candle,ExchangeId,MarketType} from "@/lib/market/types";
import {HeatBook,HISTORY_MS,type HeatSlice,type HeatCell} from "@/lib/market/heatmap/book";
import {HeatmapPrimitive,type HeatRect} from "@/lib/market/heatmap/primitive";
import {loadHeatmap,saveHeatmap} from "@/lib/market/heatmap/storage";
import type {HeatmapSettings} from "@/lib/market/heatmap/settings";
import {useFloatingNotice} from "@/components/FloatingNotices";
import {object} from "@/lib/market/orderbook/model";
import {useOrderBook} from "@/hooks/use-order-book";
import {SnapshotHeatmap,largestLiquidity} from "@/lib/market/heatmap/snapshots";
import {LiquidityZones} from "./LiquidityZones";


type Props={chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;candles:Candle[];exchange:string;marketType?:MarketType;contractSize?:number;symbol:string;quoteAsset?:string;config:HeatmapSettings};
export function LiquidityHeatmap(props:Props){
  return props.config.source==="zones"?<LiquidityZones chart={props.chart} series={props.series} candles={props.candles} opacity={props.config.opacity}/>:<OrderBookHeatmap {...props}/>;
}
function OrderBookHeatmap({chart,series,candles,exchange,marketType="spot",contractSize,symbol,config}:Props){


  const pair=useMemo(()=>({exchange:exchange as ExchangeId,marketType,contractSize,symbol,baseAsset:"",quoteAsset:""}),[exchange,marketType,contractSize,symbol]);
  const snapshot=useOrderBook(pair,exchange!=="binance"||marketType==="futures"),snapshotRef=useRef(snapshot);
  const [levels,setLevels]=useState<HeatCell[]>([]);
  useEffect(()=>{snapshotRef.current=snapshot;},[snapshot]);
  const primitive=useRef<HeatmapPrimitive|null>(null),latest=useRef({config,candles});
  const [samples,setSamples]=useState(0);
  const [status,setStatus]=useState("Подключение"),[storageWarning,setStorageWarning]=useState(""),[hover,setHover]=useState<HeatRect>();
  useEffect(()=>{latest.current={config,candles};if(primitive.current){primitive.current.config=config;primitive.current.candles=candles;primitive.current.refresh();}},[config,candles]);
  useEffect(()=>{
    let stopped=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,frame=0;
    let slices:HeatSlice[]=[],book:HeatBook|undefined,lastEvent=0,lastSaved=0,saving=false,loaded=false,attempt=0,marginAdjusted=false;
    const snapshots=new SnapshotHeatmap();
    let controller=new AbortController();const key=`${exchange}:${marketType}:${symbol}`;
    const persist=async()=>{if(saving||!loaded)return;saving=true;try{await saveHeatmap(key,slices);}catch{if(!stopped)setStorageWarning("История не сохраняется: хранилище браузера недоступно");}finally{saving=false;}};
    const redraw=()=>{setSamples(slices.length);if(primitive.current){primitive.current.slices=slices;primitive.current.refresh();}};
    async function connect(){
      if(stopped)return;book=undefined;setStatus(attempt?"Переподключение":"Синхронизация стакана");
      controller=new AbortController();const signal=controller.signal;
      const ws=new WebSocket(`wss://data-stream.binance.vision/ws/${encodeURIComponent(symbol.toLowerCase())}@depth@100ms`);socket=ws;
      let pending:unknown[]=[],ready=false;
      const fail=()=>{book=undefined;ws.close();};
      ws.onmessage=event=>{if(stopped||socket!==ws)return;try{
        const input=JSON.parse(event.data),data=object(input);
        if(data.e!=="depthUpdate"||data.s!==symbol)return;
        if(!Number.isFinite(data.E)||Math.abs(Date.now()-Number(data.E))>30000)throw new Error("Stale depth");
        if(!ready){pending.push(input);if(pending.length>2000)fail();return;}
        if(book?.update(input,Date.now())){lastEvent=Date.now();attempt=0;setStatus("Онлайн · история накапливается");}
      }catch{fail();}};
      ws.onopen=()=>{void (async()=>{try{
        const response=await fetch(`/api/market/heatmap?${new URLSearchParams({exchange:"binance",symbol})}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),cache:"no-store"}),json=await response.json();
        if(!response.ok)throw new Error(json.error?.message||"Нет снимка стакана");
        if(stopped||socket!==ws||signal.aborted)return;
        const next=new HeatBook();next.snapshot(json.data,Date.now());
        for(const item of pending)next.update(item,Date.now());
        pending=[];book=next;ready=true;lastEvent=Date.now();setStatus("Онлайн · история накапливается");
      }catch(error){if(!stopped&&socket===ws){setStatus(error instanceof Error?error.message:"Ошибка синхронизации");fail();}}})();};
      ws.onerror=fail;
      ws.onclose=()=>{if(stopped||socket!==ws)return;controller.abort();book=undefined;setStatus("Переподключение · пропуск в истории");retry=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(attempt++,5)));};
    }
    function attach(){
      if(stopped)return;const source=series.current,instance=chart.current;
      if(!source||!instance){frame=requestAnimationFrame(attach);return;}
      const layer=new HeatmapPrimitive(latest.current.config);layer.candles=latest.current.candles;primitive.current=layer;source.attachPrimitive(layer);
      void loadHeatmap(key).then(history=>{if(!stopped){slices=history;redraw();}}).catch(()=>{if(!stopped)setStorageWarning("Сохранённая история недоступна");}).finally(()=>{if(!stopped){loaded=true;if(exchange==="binance"&&marketType==="spot")void connect();}});
    }
    frame=requestAnimationFrame(attach);
    const timer=setInterval(()=>{
      const now=Date.now();
      const currentCandles=latest.current.candles;
      if(!marginAdjusted&&chart.current&&currentCandles.length){
        const scale=chart.current.timeScale(),range=scale.getVisibleLogicalRange(),last=scale.timeToIndex(Math.floor(now/1000) as UTCTimestamp,true);
        if(range&&last!==null){marginAdjusted=true;if(range.to>=Number(last)-1&&range.to<=Number(last)+.5)scale.setVisibleLogicalRange({from:range.from,to:Number(last)+Math.max(2,(range.to-range.from)*.08)});}
      }
      if(exchange!=="binance"||marketType==="futures"){
        const source=snapshotRef.current,data=source.book;
        if(loaded&&data&&data.exchange===exchange&&data.symbol===symbol&&now-data.receivedAt<=5000&&!document.hidden){
          const slice=snapshots.slice(data,now);slices=[...slices.filter(s=>s.time>=now-HISTORY_MS),slice].slice(-1800);redraw();setLevels(largestLiquidity(slice,latest.current.config.persistence));setStatus(source.mode==="ws"?"Онлайн · 20 уровней":"Снимки REST · 20 уровней");
        }else {setLevels([]);setStatus(source.error||"Ожидание свежего стакана");}
      }
      if(book&&now-lastEvent<=5000&&!document.hidden){
        const slice=book.slice(now);slices=[...slices.filter(s=>s.time>=now-HISTORY_MS),slice].slice(-1800);redraw();setLevels(largestLiquidity(slice,latest.current.config.persistence));
      }else if(exchange==="binance"){setLevels([]);if(book&&now-lastEvent>5000){book=undefined;setStatus("Нет свежих данных · пересинхронизация");socket?.close();}}
      if(now-lastSaved>=10000){lastSaved=now;void persist();}
    },1000);
    const onHide=()=>{if(document.hidden)void persist();};document.addEventListener("visibilitychange",onHide);
    const chartRef=chart;
    return()=>{stopped=true;cancelAnimationFrame(frame);clearInterval(timer);clearTimeout(retry);controller.abort();if(socket){socket.onclose=null;socket.close();}document.removeEventListener("visibilitychange",onHide);void persist();const layer=primitive.current;if(layer?.attachedData&&chartRef.current===layer.attachedData.chart){layer.attachedData.series.detachPrimitive(layer);}primitive.current=null;};
  },[chart,series,exchange,marketType,symbol]);
  useEffect(()=>{
    const source=series.current,instance=chart.current;if(!source||!instance)return;
    const lines=levels.map(level=>source.createPriceLine({price:level.price,color:level.side==="bid"?"#6dbd8b":"#e7956a",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:level.side==="bid"?"Лимитные покупки":"Лимитные продажи"}));
    const seriesRef=series;
    return()=>{if(seriesRef.current===source)for(const line of lines)source.removePriceLine(line);};
  },[levels,series,chart]);
  useEffect(()=>{
    const element=chart.current?.chartElement();if(!element)return;
    const move=(event:PointerEvent)=>{const bounds=element.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;setHover(primitive.current?.rects.findLast(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h));};
    const leave=()=>setHover(undefined);element.addEventListener("pointermove",move);element.addEventListener("pointerleave",leave);
    return()=>{element.removeEventListener("pointermove",move);element.removeEventListener("pointerleave",leave);};
  },[chart]);
  const number=(value:number)=>value.toLocaleString("ru-RU",{maximumSignificantDigits:7});
  useFloatingNotice(`heatmap-storage:${exchange}:${symbol}`,storageWarning);
  return <><span className="sr-only" data-heatmap-samples={samples} data-heatmap-status={status}/>
    {hover&&<div className="heatmap-tooltip"><strong>Ликвидность · {hover.cell.side==="bid"?"Заявки покупателей":"Заявки продавцов"}</strong><span>{new Date(hover.time).toLocaleTimeString()} · {number(hover.cell.price)}</span><span>Объём: {number(hover.cell.quantity)}</span><span>В валюте котировки: {number(hover.cell.notional)}</span><span>Наблюдается от {Math.max(0,Math.floor((hover.time-hover.cell.since)/1000))} с · яркость {Math.round(hover.intensity*100)}%</span></div>}
  </>;
}
