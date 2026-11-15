"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import {type IChartApi,type ISeriesApi,type ISeriesPrimitive,type IPrimitivePaneRenderer,type IPrimitivePaneView,type SeriesAttachedParameter,type Time} from "lightweight-charts";
import type {Candle,ExchangeId,Timeframe} from "@/lib/market/types";
import {intervalSeconds} from "@/lib/market/intervals";
import {mergeCandles} from "@/lib/market/normalize";
import type {IndicatorSettings} from "@/lib/indicators/settings";
import {candleVolumeProfile,PROFILE_METHOD,type VolumeProfile as Profile} from "@/lib/indicators/volume-profile";
import type {ProfileHistory} from "@/lib/indicators/profile-history";
import {utcSession} from "@/lib/indicators/vwap";
type Config=IndicatorSettings["profile"];
/** Library primitive: price transforms, pane clipping, DPR and scale/resize redraws stay owned by Lightweight Charts. No hitTest. */
export class ProfilePrimitive implements ISeriesPrimitive<Time>{
  private update?:()=>void;
  private source?:ISeriesApi<"Candlestick">;
  private views:IPrimitivePaneView[]=[{zOrder:()=>"bottom",renderer:()=>this}];
  constructor(private profile:Profile,private config:Config){}
  attached({series,requestUpdate}:SeriesAttachedParameter<Time>){this.source=series as ISeriesApi<"Candlestick">;this.update=requestUpdate;}
  detached(){this.update=undefined;this.source=undefined;}
  paneViews(){return this.views;}
  set(profile:Profile,config:Config){this.profile=profile;this.config=config;this.update?.();}
  draw(){}
  drawBackground(target:Parameters<IPrimitivePaneRenderer["draw"]>[0]){
    if(!this.source||!this.profile.maximum)return;
    target.useMediaCoordinateSpace(({context:ctx,mediaSize:{width,height}})=>{
      const inset=this.config.side==="left"?54:8,maxWidth=Math.max(0,Math.min(width*this.config.width/100,width-inset-8));
      ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
      for(const [index,bin] of this.profile.bins.entries()){
        const top=this.source!.priceToCoordinate(bin.high),bottom=this.source!.priceToCoordinate(bin.low);
        if(top===null||bottom===null||!bin.volume)continue;
        const w=maxWidth*bin.volume/this.profile.maximum;
        ctx.fillStyle=index===this.profile.poc?this.config.pocColor:this.config.color;ctx.globalAlpha=this.config.opacity/100;
        ctx.fillRect(this.config.side==="left"?inset:width-inset-w,Math.min(top,bottom),w,Math.max(1,Math.abs(bottom-top)-.5));
      }
      if(this.config.poc&&this.profile.poc!==null){
        const bin=this.profile.bins[this.profile.poc],value=(bin.low+bin.high)/2,y=this.source!.priceToCoordinate(value);
        if(y!==null&&y>=0&&y<=height){
          ctx.globalAlpha=.85;ctx.strokeStyle=this.config.pocColor;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(inset,y);ctx.lineTo(width-8,y);ctx.stroke();
          ctx.globalAlpha=1;ctx.fillStyle=this.config.pocColor;ctx.font="11px 'Segoe UI',sans-serif";ctx.fillText(`POC ${Number(value.toPrecision(8))}`,this.config.side==="left"?inset+4:Math.max(4,width-inset-maxWidth),Math.max(12,y-5));
        }
      }
      ctx.restore();
    });
  }
}
interface Props {chart:RefObject<IChartApi|null>;series:RefObject<ISeriesApi<"Candlestick">|null>;candles:Candle[];history:Candle[];exchange:ExchangeId;symbol:string;timeframe:Timeframe;config:Config}
export function VolumeProfile({chart,series,candles,history,exchange,symbol,timeframe,config}:Props){
  const [range,setRange]=useState<{from:number;to:number}>(),[clock,setClock]=useState(()=>Math.floor(Date.now()/1000));
  const [state,setState]=useState<{key:string;data?:ProfileHistory;error?:string}>();
  const primitive=useRef<ProfilePrimitive|null>(null);
  const step=intervalSeconds(timeframe),day=Math.max(utcSession(clock),utcSession(candles.at(-1)?.time??clock));
  const from=config.period==="day"?day:range?.from,to=config.period==="day"?day+86400:range?.to;
  const key=`${exchange}:${symbol}:${timeframe}:${config.period}:${from}:${to}`;
  useEffect(()=>{
    let instance:IChartApi|null=null,timer:ReturnType<typeof setTimeout>|undefined;
    const owns=()=>chart.current===instance;
    const read=()=>{clearTimeout(timer);timer=setTimeout(()=>{const r=instance?.timeScale().getVisibleRange();if(r){const next={from:Number(r.from),to:Number(r.to)+step};setRange(old=>old?.from===next.from&&old.to===next.to?old:next);}},300);};
    const attach=setTimeout(()=>{instance=chart.current;if(instance){read();instance.timeScale().subscribeVisibleTimeRangeChange(read);}},0);
    return()=>{clearTimeout(attach);clearTimeout(timer);if(instance&&owns())instance.timeScale().unsubscribeVisibleTimeRangeChange(read);};
  },[chart,step,candles.length]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setClock(Math.floor(Date.now()/1000));},15000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(from===undefined||to===undefined||!candles.length)return;
    const controller=new AbortController();let busy=false;
    async function load(){if(document.hidden||busy)return;busy=true;try{
      const response=await fetch(`/api/market/volume-profile?${new URLSearchParams({exchange,symbol,timeframe,from:String(from),to:String(to)})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),cache:"no-store"}),json=await response.json();
      if(!response.ok)throw new Error(json.error?.message||"Не удалось загрузить профиль объёма.");
      if(!json.data||!Array.isArray(json.data.candles))throw new Error("Некорректные данные профиля.");
      if(!controller.signal.aborted)setState({key,data:json.data});
    }catch(error){if(!controller.signal.aborted)setState({key,error:error instanceof Error?error.message:"Ошибка загрузки профиля."});}finally{busy=false;}}
    const delay=setTimeout(()=>void load(),350),timer=setInterval(()=>void load(),15000);
    const visible=()=>{if(!document.hidden)void load();};document.addEventListener("visibilitychange",visible);
    return()=>{controller.abort();clearTimeout(delay);clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[exchange,symbol,timeframe,from,to,key,candles.length,config.period]);
  const current=state?.key===key?state:undefined,data=current?.data;
  const validTick=!!data?.tick&&Number.isFinite(data.tick)&&data.tick>0;
  const usable=!!data&&validTick&&(config.period!=="day"||data.complete);
  const [stats,setStats]=useState({total:0,poc:0,bins:0});
  useEffect(()=>{
    let instance:IChartApi|null=null,source:ISeriesApi<"Candlestick">|null=null,item:ProfilePrimitive|undefined;
    const owns=()=>chart.current===instance&&series.current===source;
    const attach=setTimeout(()=>{instance=chart.current;source=series.current;if(!instance||!source)return;item=new ProfilePrimitive({bins:[],poc:null,total:0,maximum:0},config);primitive.current=item;source.attachPrimitive(item);},0);
    return()=>{clearTimeout(attach);primitive.current=null;if(item&&source&&owns())source.detachPrimitive(item);};
    // Settings are updated by the throttled calculation below without reattaching the primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chart,series]);
  const pending=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef({data,usable,config,history,timeframe});
  useEffect(()=>{
    latest.current={data,usable,config,history,timeframe};
    if(pending.current!==null)return;
    pending.current=setTimeout(()=>{
      pending.current=null;
      const {data,usable,config,history,timeframe}=latest.current;
      const snapshots=data?(data.timeframe===timeframe?mergeCandles(data.candles,history,100000):data.candles).filter(c=>c.time>=data.from&&c.time<data.to):[];
      const result=usable?candleVolumeProfile(snapshots,config.levels,data!.tick!):{bins:[],poc:null,total:0,maximum:0};
      primitive.current?.set(result,config);setStats({total:result.total,poc:result.poc===null?0:(result.bins[result.poc].low+result.bins[result.poc].high)/2,bins:result.bins.length});
    },100);
  },[data,usable,config,history,timeframe]);
  useEffect(()=>()=>{
    if(pending.current!==null)clearTimeout(pending.current);
    // React Strict Mode replays effects after cleanup. Allow the replay to schedule a fresh calculation.
    pending.current=null;
  },[]);
  const status=current?.error||(!current?"Загрузка…":!validTick?"Шаг цены недоступен":config.period==="day"&&!data?.complete?"Нет полной истории дня":!data?.complete?"Неполный диапазон":"");
  return <div className="profile-caption" title={`${PROFILE_METHOD}${data?` Интервал свечей: ${data.timeframe}.`:""} ${status}`} data-profile-total={usable?stats.total:0} data-profile-poc={usable?stats.poc:0} data-profile-bins={usable?stats.bins:0}>Профиль объёма · Приближённо по свечам{status?` · ${status}`:""}</div>;
}
