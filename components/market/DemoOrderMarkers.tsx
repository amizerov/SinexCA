"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import type {IChartApi,ISeriesApi} from "lightweight-charts";
import {isOpen,type DemoOrder} from "@/lib/paper/orders";
export function DemoOrderMarkers({chart,series,container,orders,onEdit,onCancel}:{chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;container:RefObject<HTMLDivElement|null>;orders:DemoOrder[];onEdit:(order:DemoOrder)=>void;onCancel:(order:DemoOrder)=>void}){
  const [labels,setLabels]=useState<{order:DemoOrder;y:number;name:string}[]>([]);
  const drag=useRef<{id:string;y:number;moved:boolean}|undefined>(undefined),ignoreClick=useRef(false);
  useEffect(()=>{const instance=chart.current,source=series.current,element=container.current;if(!instance||!source||!element)return;let frame=0,disposed=false;
    const update=()=>{frame=0;if(disposed||series.current!==source)return;const height=instance.panes()[0]?.getHeight()??0;setLabels(orders.filter(isOpen).flatMap(order=>[[order.limit,"Limit"],[!order.triggered?order.stop:null,"Stop"]].flatMap(([value,name])=>{if(typeof value!=="number")return[];const y=source.priceToCoordinate(value);return y!==null&&y>=10&&y<height-10?[{order,y,name:String(name)}]:[];})));};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    schedule();instance.timeScale().subscribeVisibleLogicalRangeChange(schedule);element.addEventListener("pointermove",schedule);element.addEventListener("wheel",schedule);element.addEventListener("sinex:chart-layout",schedule);const resize=new ResizeObserver(schedule);resize.observe(element);
    return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();element.removeEventListener("pointermove",schedule);element.removeEventListener("wheel",schedule);element.removeEventListener("sinex:chart-layout",schedule);try{instance.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);}catch{/* Parent may already have removed the chart during a market switch. */}};
  },[chart,series,container,orders]);
  return <div className="demo-order-markers">{labels.map(({order,y,name})=><div key={`${order.id}:${name}`} style={{top:y-10}} className={order.side==="buy"?"positive":"negative"}><button disabled={order.filled>0}
    onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();drag.current={id:order.id,y:e.clientY,moved:false};ignoreClick.current=false;e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==order.id)return;const dy=e.clientY-d.y;if(Math.abs(dy)>3)d.moved=true;if(d.moved)e.currentTarget.parentElement!.style.transform=`translateY(${dy}px)`;}}
    onPointerUp={e=>{const d=drag.current;if(!d||d.id!==order.id)return;drag.current=undefined;e.currentTarget.parentElement!.style.transform="";e.currentTarget.releasePointerCapture(e.pointerId);if(!d.moved)return;ignoreClick.current=true;const rect=container.current?.getBoundingClientRect(),p=rect?series.current?.coordinateToPrice(e.clientY-rect.top):null;if(p&&p>0)onEdit({...order,...name==="Stop"?{stop:Number(p.toPrecision(10))}:{limit:Number(p.toPrecision(10))}});}}
    onPointerCancel={e=>{drag.current=undefined;e.currentTarget.parentElement!.style.transform="";}}
    onClick={()=>{if(ignoreClick.current){ignoreClick.current=false;return;}onEdit(order);}} title={order.filled?"Частично исполненную заявку можно отменить":"Нажмите для изменения или перетащите цену; затем подтвердите"}>{order.side==="buy"?"Покупка":"Продажа"} · {name}</button><button onClick={()=>onCancel(order)} aria-label={`Отменить заявку ${order.id}`} title="Отменить заявку">×</button></div>)}</div>;
}
