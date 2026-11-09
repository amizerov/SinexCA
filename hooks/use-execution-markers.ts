"use client";
import {useEffect,useMemo,useRef,useState,type RefObject} from "react";
import {createSeriesMarkers,LineStyle,type IChartApi,type ISeriesApi,type ISeriesMarkersPluginApi,type Time} from "lightweight-charts";
import {chartExecutions,type ChartExecution} from "@/lib/paper/chart-trades";
import type {Candle,ExchangeId,Timeframe} from "@/lib/market/types";
import type {DemoFill} from "@/lib/paper/orders";
import type {PaperPosition} from "@/lib/paper/portfolio";
export function useExecutionMarkers(chart:RefObject<IChartApi|null>,series:RefObject<ISeriesApi<"Candlestick">|null>,fills:DemoFill[],candles:Candle[],exchange:ExchangeId,symbol:string,timeframe:Timeframe,positions:PaperPosition[],enabled:boolean){
  const candleTimes=candles.map(c=>c.time).join(",");
  const openings=useMemo(()=>candleTimes?candleTimes.split(",").map(time=>({time:Number(time)})):[],[candleTimes]);
  const grouped=useMemo(()=>chartExecutions(fills,openings,exchange,symbol,timeframe),[fills,openings,exchange,symbol,timeframe]);
  const current=useRef(grouped.markers),plugin=useRef<ISeriesMarkersPluginApi<Time>|null>(null);
  const [tooltip,setTooltip]=useState<{trade:ChartExecution;x:number;y:number;width:number;height:number}>();
  const relevant=positions.filter(p=>p.exchange===exchange&&p.symbol===symbol&&p.quantity>0&&p.marketQuote===p.quote),quantity=relevant.reduce((s,p)=>s+p.quantity,0),cost=relevant.reduce((s,p)=>s+p.cost,0),average=quantity?cost/quantity:undefined,breakEven=average===undefined?undefined:average/.999,quote=relevant[0]?.quote;
  useEffect(()=>{
    const instance=chart.current,source=series.current;if(!instance||!source)return;
    const attached=()=>chart.current===instance&&series.current===source;
    const markers=createSeriesMarkers(source,[],{autoScale:false,zOrder:"top"});plugin.current=markers;
    const hover=(event:Parameters<Parameters<IChartApi["subscribeCrosshairMove"]>[0]>[0])=>{
      if(!event.point||event.paneIndex!=null&&event.paneIndex!==0||series.current!==source){setTooltip(undefined);return;}
      const trade=current.current.find(t=>t.id===event.hoveredObjectId);
      setTooltip(trade?{trade,x:event.point.x,y:event.point.y,width:instance.timeScale().width(),height:instance.panes()[0]?.getHeight()??200}:undefined);
    };
    instance.subscribeCrosshairMove(hover);
    return()=>{if(plugin.current===markers)plugin.current=null;if(attached()){instance.unsubscribeCrosshairMove(hover);markers.detach();}};
  },[chart,series]);
  useEffect(()=>{
    current.current=enabled?grouped.markers:[];
    plugin.current?.setMarkers(current.current.map(t=>({id:t.id,time:t.time as Time,position:t.side==="buy"?"belowBar":"aboveBar",price:t.price,shape:t.side==="buy"?"arrowUp":"arrowDown",color:t.side==="buy"?"#9bd67a":"#ec7775",size:1,text:t.side==="buy"?"К":"П"})));
  },[enabled,grouped]);
  useEffect(()=>{
    const source=series.current;if(!source||!enabled||breakEven===undefined)return;
    const attached=()=>series.current===source;
    const line=source.createPriceLine({price:breakEven,color:"#f4ce85",lineWidth:1,lineStyle:LineStyle.Dotted,axisLabelVisible:true,title:"Безубыток ≈"});
    return()=>{if(attached())source.removePriceLine(line);};
  },[series,breakEven,enabled]);
  const hovered=enabled&&tooltip?grouped.markers.find(t=>t.id===tooltip.trade.id):undefined;
  return {grouped,tooltip:hovered&&tooltip?{...tooltip,trade:hovered}:undefined,average,breakEven,quantity,quote};
}
