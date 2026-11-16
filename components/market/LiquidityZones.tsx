"use client";
import {useEffect,useMemo,useRef,type RefObject} from "react";
import type {IChartApi,ISeriesApi,ISeriesPrimitive,SeriesAttachedParameter,IPrimitivePaneRenderer,IPrimitivePaneView,Logical} from "lightweight-charts";
import type {Candle} from "@/lib/market/types";
import {liquidityZones,type LiquidityZone} from "@/lib/market/heatmap/zones";
import {heatmapTimeCoordinate} from "@/lib/market/heatmap/primitive";

class ZonesPrimitive implements ISeriesPrimitive {
  candles:Candle[]=[];zones:LiquidityZone[]=[];opacity=45;
  private connection?:SeriesAttachedParameter;
  attached(connection:SeriesAttachedParameter){this.connection=connection;}
  detached(){this.connection=undefined;}
  refresh(){this.connection?.requestUpdate();}
  private renderer:IPrimitivePaneRenderer={draw:target=>target.useMediaCoordinateSpace(({context,mediaSize})=>{
    const data=this.connection;if(!data)return;
    const x=(time:number)=>heatmapTimeCoordinate(time*1000,this.candles,index=>data.chart.timeScale().logicalToCoordinate(index as Logical));
    context.save();
    for(const zone of this.zones){
      const from=x(zone.confirmedAt),to=zone.endedAt===undefined?mediaSize.width:x(zone.endedAt),top=data.series.priceToCoordinate(zone.upper),bottom=data.series.priceToCoordinate(zone.lower);
      if(from===null||to===null||top===null||bottom===null||to<0||from>mediaSize.width||bottom<0||top>mediaSize.height)continue;
      const left=Math.max(0,from),width=Math.min(mediaSize.width,to)-left,height=Math.max(3,bottom-top);
      if(width<=0)continue;
      const color=zone.side==="support"?"83,171,113":"215,105,113";
      const strength=this.opacity/100*(zone.endedAt===undefined?1:.45);
      context.fillStyle=`rgba(${color},${strength*.28})`;context.fillRect(left,top,width,height);
      context.strokeStyle=`rgba(${color},${strength*.9})`;context.lineWidth=1;context.strokeRect(left+.5,Math.floor(top)+.5,Math.max(0,width-1),height);
    }
    context.restore();
  })};
  private view:IPrimitivePaneView={zOrder:()=>"bottom",renderer:()=>this.renderer};
  paneViews(){return [this.view];}
}

export function LiquidityZones({chart,series,candles,opacity}:{chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;candles:Candle[];opacity:number}){
  const zones=useMemo(()=>liquidityZones(candles),[candles]);
  const primitive=useRef<ZonesPrimitive|null>(null),latest=useRef({candles,opacity,zones});
  useEffect(()=>{latest.current={candles,opacity,zones};const layer=primitive.current;if(layer){layer.candles=candles;layer.zones=zones;layer.opacity=opacity;layer.refresh();}},[candles,opacity,zones]);
  useEffect(()=>{
    let frame=0,source:ISeriesApi<"Candlestick">|null=null;
    const attach=()=>{source=series.current;if(!chart.current||!source){frame=requestAnimationFrame(attach);return;}const layer=new ZonesPrimitive();layer.candles=latest.current.candles;layer.zones=latest.current.zones;layer.opacity=latest.current.opacity;primitive.current=layer;source.attachPrimitive(layer);layer.refresh();};
    frame=requestAnimationFrame(attach);const seriesRef=series;
    return()=>{cancelAnimationFrame(frame);if(primitive.current&&source&&seriesRef.current===source)source.detachPrimitive(primitive.current);primitive.current=null;};
  },[chart,series]);
  return <span className="sr-only" data-liquidity-mode="zones" data-zone-count={zones.length}/>;
}
