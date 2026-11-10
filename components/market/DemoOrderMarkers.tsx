"use client";
import {useEffect,useState,type RefObject} from "react";
import type {IChartApi,ISeriesApi} from "lightweight-charts";
import type {DemoOrder} from "@/lib/paper/orders";
import {orderLevels,levelName,orderColor,type OrderLevel} from "@/lib/paper/order-levels";
export function DemoOrderMarkers({chart,series,container,orders,onInspect}:{chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;container:RefObject<HTMLDivElement|null>;orders:DemoOrder[];onInspect:(order:DemoOrder)=>void}){
  const [labels,setLabels]=useState<(OrderLevel&{y:number})[]>([]);
  useEffect(()=>{
    const element=container.current;if(!element)return;let frame=0,disposed=false,bound:IChartApi|null=null;
    const update=()=>{
      frame=0;const instance=chart.current,source=series.current;if(disposed||!instance||!source)return;
      if(bound!==instance){bound=instance;instance.timeScale().subscribeVisibleLogicalRangeChange(schedule);}
      const height=instance.panes()[0]?.getHeight()??0;
      setLabels(orderLevels(orders).flatMap(level=>{const y=source.priceToCoordinate(level.price);return y!==null&&y>=12&&y<height-12?[{...level,y}]:[];}));
    };
    const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(update);};
    schedule();element.addEventListener("pointermove",schedule);element.addEventListener("wheel",schedule);element.addEventListener("sinex:chart-layout",schedule);
    const resize=new ResizeObserver(schedule);resize.observe(element);
    const live=()=>bound&&chart.current===bound;
    return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();element.removeEventListener("pointermove",schedule);element.removeEventListener("wheel",schedule);element.removeEventListener("sinex:chart-layout",schedule);if(live())bound?.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);};
  },[chart,series,container,orders]);
  return <div className="demo-order-markers">{labels.map(({order,y,kind})=><button type="button" key={`${order.id}:${kind}`} className={`order-marker-triangle ${order.side}`} data-order-id={order.id} data-order-level={kind} style={{top:y-12,color:orderColor(order.side)}} onClick={e=>{e.stopPropagation();onInspect(order);}} aria-label={`${order.side==="buy"?"Покупка":"Продажа"} · ${levelName(kind)}`} title={`${levelName(kind)} · Детали заявки`}><span aria-hidden="true"/></button>)}</div>;
}
