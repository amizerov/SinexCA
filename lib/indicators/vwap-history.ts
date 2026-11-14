import type {Candle,Timeframe} from "@/lib/market/types";
import {isVwapTimeframe,utcSession,dailyVwap} from "./vwap";
export interface SessionHistory {candles:Candle[];sessionStart:number;complete:boolean}
export type CandlePage=(request:{symbol:string;timeframe:Timeframe;limit:number;endTime?:number})=>Promise<Candle[]>;
/** Backfill the UTC session independently of the chart's 500 visible candles. Bounded, serial pagination. */
export async function loadVwapSession(loader:CandlePage,symbol:string,timeframe:Timeframe,now:number,pageSize=1000):Promise<SessionHistory>{
  const sessionStart=utcSession(now);if(!isVwapTimeframe(timeframe))return {candles:[],sessionStart,complete:false};
  const map=new Map<number,Candle>();let endTime=now;
  for(let page=0;page<180;page++){
    const batch=await loader({symbol,timeframe,limit:pageSize,endTime});
    const accepted=batch.filter(c=>Number.isFinite(c.time)&&c.time<=endTime);
    if(!accepted.length)break;
    for(const candle of accepted)if(candle.time>=sessionStart)map.set(candle.time,candle);
    const first=Math.min(...accepted.map(c=>c.time));
    if(first<=sessionStart||first>=endTime)break;
    endTime=first-1;
  }
  const candles=[...map.values()].sort((a,b)=>a.time-b.time);
  const session=dailyVwap(candles,timeframe).find(day=>day.start===sessionStart);
  return {candles,sessionStart,complete:!!session?.complete};
}
