"use client";
import { useEffect,useRef,type RefObject } from "react";
import { LineSeries,LineStyle,type IChartApi,type ISeriesApi,type UTCTimestamp,type IPriceLine } from "lightweight-charts";
import { ema,sma,rsi } from "@/lib/indicators/calculate";
import type { IndicatorSettings } from "@/lib/indicators/settings";
import type { Candle } from "@/lib/market/types";
export function useChartIndicators(chart:RefObject<IChartApi|null>,history:Candle[],visible:Candle[],settings:IndicatorSettings,host:RefObject<HTMLDivElement|null>){
  const lines=useRef(new Map<string,ISeriesApi<"Line">>()),bounds=useRef<IPriceLine[]>([]),boundChart=useRef<IChartApi|null>(null);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    if(boundChart.current!==instance){lines.current.clear();bounds.current=[];boundChart.current=instance;}
    const configs=[...settings.ema.map((line,index)=>({...line,key:`ema-${index}`,name:`EMA ${line.period}`,calculate:ema})),{...settings.sma,key:"sma",name:`SMA ${settings.sma.period}`,calculate:sma},{...settings.rsi,key:"rsi",name:`RSI ${settings.rsi.period}`,calculate:rsi}];
    const active=new Set(configs.filter(line=>line.enabled).map(line=>line.key));
    for(const [key,line] of lines.current)if(!active.has(key)){instance.removeSeries(line);lines.current.delete(key);if(key==="rsi")bounds.current=[];}
    const first=visible[0]?.time??Infinity;
    for(const config of configs){
      if(!config.enabled)continue;let line=lines.current.get(config.key);
      if(!line){line=instance.addSeries(LineSeries,{color:config.color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true,title:config.name,...config.key==="rsi"?{priceFormat:{type:"custom" as const,formatter:(value:number)=>value.toFixed(1),minMove:.1},autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})}:{}},config.key==="rsi"?instance.panes().length:0);lines.current.set(config.key,line);}
      line.applyOptions({color:config.color,title:config.name});
      line.setData(config.calculate(history,config.period).filter(point=>point.time>=first).map(point=>({...point,time:point.time as UTCTimestamp})));
      if(config.key==="rsi"){
        for(const bound of bounds.current)line.removePriceLine(bound);
        bounds.current=[settings.rsi.lower,50,settings.rsi.upper].map(level=>line!.createPriceLine({price:level,color:level===50?"#465340":"#7c6a95",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:level===50?`RSI ${config.period}`:""}));
        line.getPane().setStretchFactor(1.5);
      }
    }
    instance.panes()[0].setStretchFactor(5);host.current?.dispatchEvent(new Event("sinex:chart-layout",{bubbles:true}));
  },[chart,history,visible,settings,host]);
}
