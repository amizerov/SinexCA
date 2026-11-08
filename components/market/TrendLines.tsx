"use client";
import { useEffect,useRef,useState,type RefObject,type PointerEvent } from "react";
import type { IChartApi,ISeriesApi,Logical } from "lightweight-charts";
import type { useDrawingLevels } from "@/hooks/use-drawing-levels";
import type { HorizontalLevel } from "@/lib/drawings/types";
import type { Candle } from "@/lib/market/types";
import { logicalAtTime,timeAtLogical } from "@/lib/drawings/coordinates";
type Point={time:number;price:number};
interface Props {chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;candles:Candle[];drawing:ReturnType<typeof useDrawingLevels>;selectedId:string|null;select:(id:string|null)=>void;active:boolean;finish:()=>void;enabled:boolean;magnet:boolean}
export function TrendLines(props:Props) {
  const {chart,series,candles,drawing,selectedId,select,active,finish,enabled,magnet}=props;
  const [draft,setDraft]=useState<HorizontalLevel|null>(null);
  const svg=useRef<SVGSVGElement>(null),surface=useRef<HTMLDivElement>(null);
  const latest=useRef({props,draft});
  const scheduleRef=useRef(()=>{});
  const drag=useRef<{id:string;part:"body"|"start"|"end";origin:Point;before:HorizontalLevel[];x:number;y:number;moved:boolean}|null>(null);
  useEffect(()=>{latest.current={props,draft};scheduleRef.current();},[props,draft]);
  useEffect(()=>{
    let frame=0,stopped=false,bound:IChartApi|null=null;
    const host=svg.current?.parentElement?.parentElement;
    function tick(){
      if(stopped)return;
      const current=latest.current,{chart,series,candles,drawing}=current.props,instance=chart.current,source=series.current;if(!instance||!source)return;
      if(bound!==instance){bound=instance;instance.timeScale().subscribeVisibleLogicalRangeChange(schedule);}
      const pane=instance.paneSize(0);svg.current?.setAttribute("width",String(pane.width));svg.current?.setAttribute("height",String(pane.height));
      if(surface.current){surface.current.style.width=`${pane.width}px`;surface.current.style.height=`${pane.height}px`;}
      for(const line of [...drawing.levels,...current.draft?[current.draft]:[]]){
        if(line.type!=="trend")continue;const group=svg.current?.querySelector<SVGGElement>(`[data-trend-id="${line.id}"]`);if(!group)continue;
        const start=logicalAtTime(line.startTime!,candles),end=logicalAtTime(line.endTime!,candles);
        const x1=start===null?null:instance.timeScale().logicalToCoordinate(start as Logical),x2=end===null?null:instance.timeScale().logicalToCoordinate(end as Logical);
        const y1=source.priceToCoordinate(line.price),y2=source.priceToCoordinate(line.endPrice!);
        const visible=x1!==null&&x2!==null&&y1!==null&&y2!==null;group.style.display=visible?"":"none";if(!visible)continue;
        group.querySelectorAll("line").forEach(node=>{node.setAttribute("x1",String(x1));node.setAttribute("y1",String(y1));node.setAttribute("x2",String(x2));node.setAttribute("y2",String(y2));});
        group.querySelectorAll("circle").forEach((node,index)=>{node.setAttribute("cx",String(index===0?x1:x2));node.setAttribute("cy",String(index===0?y1:y2));});
      }
    }
    function schedule(){if(stopped||frame)return;frame=requestAnimationFrame(()=>{tick();frame=requestAnimationFrame(()=>{frame=0;if(!stopped)tick();});});}
    scheduleRef.current=schedule;schedule();const observer=new ResizeObserver(schedule);if(host)observer.observe(host);
    const move=(event:globalThis.PointerEvent)=>{if(event.buttons)schedule();};
    host?.addEventListener("pointermove",move);host?.addEventListener("pointerup",schedule);host?.addEventListener("wheel",schedule,{passive:true});host?.addEventListener("dblclick",schedule);host?.addEventListener("sinex:chart-layout",schedule);
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){if(drag.current){latest.current.props.drawing.preview(drag.current.before);drag.current=null;}setDraft(null);}};
    window.addEventListener("keydown",escape);
    return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();scheduleRef.current=()=>{};window.removeEventListener("keydown",escape);host?.removeEventListener("pointermove",move);host?.removeEventListener("pointerup",schedule);host?.removeEventListener("wheel",schedule);host?.removeEventListener("dblclick",schedule);host?.removeEventListener("sinex:chart-layout",schedule);try{bound?.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);}catch{/* Chart disposed. */}};
  },[]);
  function point(event:PointerEvent,snap=true):Point|null {
    const host=svg.current?.parentElement?.parentElement,instance=chart.current,source=series.current;if(!host||!instance||!source)return null;
    const bounds=host.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top,pane=instance.paneSize(0);
    if(x<0||x>pane.width||y<0||y>pane.height)return null;
    const logical=instance.timeScale().coordinateToLogical(x),raw=source.coordinateToPrice(y);if(logical===null||raw===null||raw<=0||raw>1e12||!Number.isFinite(raw))return null;
    let value:number=raw;const snapping=snap&&(magnet||event.shiftKey),time=timeAtLogical(snapping?Math.round(logical):logical,candles);
    if(time===null||time<0||time>32503680000)return null;
    const candle=snapping?candles[Math.round(logical)]:undefined;
    if(candle){const closest=[candle.high,candle.low].map(price=>({price,distance:Math.abs((source.priceToCoordinate(price)??Infinity)-y)})).sort((a,b)=>a.distance-b.distance)[0];if(closest.distance<=12)value=closest.price;}
    return {time,price:Number(value.toPrecision(12))};
  }
  function create(event:PointerEvent){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();if(!enabled||drawing.levels.length>=100)return;
    const p=point(event);if(!p)return;
    if(!draft)setDraft({id:crypto.randomUUID(),type:"trend",price:p.price,color:"#63c8ff",startTime:p.time,endTime:p.time,endPrice:p.price,width:2});
    else if(p.time!==draft.startTime){const line={...draft,endTime:p.time,endPrice:p.price};drawing.commit([...drawing.levels,line]);select(line.id);setDraft(null);finish();}
  }
  function start(event:PointerEvent<Element>,line:HorizontalLevel,part:"body"|"start"|"end"){
    if(event.button!==0||!enabled)return;event.preventDefault();event.stopPropagation();const origin=point(event,false);if(!origin)return;
    select(line.id);drag.current={id:line.id,part,origin,before:drawing.levels,x:event.clientX,y:event.clientY,moved:false};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<Element>){
    const state=drag.current;if(!state)return;event.preventDefault();event.stopPropagation();
    if(!state.moved&&Math.hypot(event.clientX-state.x,event.clientY-state.y)<3)return;
    const p=point(event,state.part!=="body"),original=state.before.find(line=>line.id===state.id);if(!p||!original)return;
    let next:HorizontalLevel;
    if(state.part==="start")next={...original,price:p.price,startTime:p.time};
    else if(state.part==="end")next={...original,endPrice:p.price,endTime:p.time};
    else{const dt=p.time-state.origin.time,dp=p.price-state.origin.price;next={...original,price:Number((original.price+dp).toPrecision(12)),endPrice:Number((original.endPrice!+dp).toPrecision(12)),startTime:original.startTime!+dt,endTime:original.endTime!+dt};}
    if(next.startTime!<0||next.endTime!<0||next.startTime!>32503680000||next.endTime!>32503680000||next.startTime===next.endTime||next.price<=0||next.endPrice!<=0||next.price>1e12||next.endPrice!>1e12)return;
    state.moved=true;drawing.preview(drawing.getLevels().map(line=>line.id===state.id?next:line));
  }
  function end(event:PointerEvent<Element>,cancel=false){const state=drag.current;if(!state)return;event.stopPropagation();drag.current=null;if(cancel)drawing.preview(state.before);else if(state.moved)drawing.commit(drawing.getLevels(),state.before);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  return <>
    {active&&<div ref={surface} className="drawing-surface" aria-label="Поставить точки трендовой линии" onPointerDown={create} onPointerMove={event=>{if(draft){const p=point(event);if(p)setDraft({...draft,endTime:p.time,endPrice:p.price});}}}/>}
    {active&&<span className="drawing-hint">{draft?"Вторая точка · Esc — отмена":"Первая точка трендовой линии"}</span>}
    <svg ref={svg} className="trend-layer" aria-label="Трендовые линии">
      {/* eslint-disable-next-line react-hooks/refs -- Ref reads occur only in the pointer handlers passed below, never during rendering. */}
      {[...drawing.levels.filter(line=>line.type==="trend"),...active&&draft?[draft]:[]].map(line=><g key={line.id} data-trend-id={line.id}>
        <title>Трендовая линия · ручная разметка этой пары и биржи</title>
        <line stroke={line.color} strokeWidth={line.width||2} strokeDasharray={line.style==="dashed"?"8 5":line.style==="dotted"?"2 4":undefined} opacity={line===draft ? .75 : 1}/>
        {line!==draft&&<line className="trend-hit" stroke="transparent" strokeWidth={16} role="button" aria-label="Выбрать трендовую линию" tabIndex={active?-1:0} style={{pointerEvents:active?"none":"stroke"}} onPointerDown={event=>start(event,line,"body")} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onContextMenu={event=>{event.preventDefault();select(line.id);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(line.id);}}}/>}
        {(selectedId===line.id||line===draft)&&["start","end"].map(part=><circle key={part} className="trend-endpoint" r={6} fill="#111614" stroke={line.color} strokeWidth={2} style={{pointerEvents:active?"none":"auto"}} role="button" aria-label={part==="start"?"Начало трендовой линии":"Конец трендовой линии"} onPointerDown={event=>start(event,line,part as "start"|"end")} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)}/>)}
      </g>)}
    </svg>
  </>;
}
