"use client";
import {useEffect,useRef,type RefObject} from "react";
import {LineSeries,LineStyle,type IChartApi,type ISeriesApi,type UTCTimestamp} from "lightweight-charts";
import type {Candle,Timeframe} from "@/lib/market/types";
import type {IndicatorSettings} from "@/lib/indicators/settings";
import {dailyVwap,isVwapTimeframe,utcSession} from "@/lib/indicators/vwap";
export function useVwapSeries(chart:RefObject<IChartApi|null>,history:Candle[],visible:Candle[],timeframe:Timeframe,config:IndicatorSettings["vwap"]){
  const lines=useRef(new Map<number,ISeriesApi<"Line">>()),owner=useRef<IChartApi|null>(null);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    if(owner.current!==instance){lines.current.clear();owner.current=instance;}
    const first=visible[0]?.time??Infinity,last=visible.at(-1)?.time??-Infinity;
    const sessions=config.enabled&&isVwapTimeframe(timeframe)?dailyVwap(history,timeframe).filter(session=>session.complete&&session.points.some(point=>point.time>=first&&point.time<=last)):[];
    const active=new Set(sessions.map(session=>session.start));
    for(const [start,line] of lines.current)if(!active.has(start)){instance.removeSeries(line);lines.current.delete(start);}
    for(const session of sessions){
      let line=lines.current.get(session.start);
      const close=visible.at(-1)?.close||1,precision=close>=1?2:Math.min(8,Math.max(4,Math.ceil(-Math.log10(close))+3));
      const options={color:config.color,lineWidth:config.width,lineStyle:LineStyle.Dashed,title:"VWAP",priceLineVisible:false,lastValueVisible:session.start===utcSession(Date.now()/1000),crosshairMarkerVisible:true,priceFormat:{type:"price" as const,precision,minMove:10**-precision}};
      if(!line){line=instance.addSeries(LineSeries,options,0);lines.current.set(session.start,line);}else line.applyOptions(options);
      // Separate series are essential: whitespace points alone do not break a Lightweight Charts line.
      line.setData(session.points.filter(point=>point.time>=first&&point.time<=last).map(point=>({...point,time:point.time as UTCTimestamp})));
    }
  },[chart,history,visible,timeframe,config]);
}
