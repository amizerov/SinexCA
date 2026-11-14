import type {Candle,Timeframe} from "@/lib/market/types";
import {intervalSeconds} from "@/lib/market/intervals";
import type {IndicatorPoint} from "./calculate";
export const VWAP_DESCRIPTION="Свечной расчёт по HLC3, сброс в 00:00 UTC";
export const utcSession=(time:number)=>Math.floor(time/86400)*86400;
export const isVwapTimeframe=(timeframe:Timeframe)=>intervalSeconds(timeframe)<86400;
export interface VwapSession {start:number;points:IndicatorPoint[];complete:boolean}
/** Replace equal timestamps before summing. Missing/invalid bars invalidate the remainder of that UTC session. */
export function dailyVwap(input:Candle[],timeframe:Timeframe):VwapSession[]{
  if(!isVwapTimeframe(timeframe))return [];
  const candles=[...new Map(input.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time),step=intervalSeconds(timeframe),result:VwapSession[]=[];
  let day=-1,total=0,weighted=0,previous=-1,valid=false,session:VwapSession;
  for(const candle of candles){
    const start=utcSession(candle.time);
    if(day!==start){day=start;total=0;weighted=0;previous=start-step;valid=candle.time===start;session={start,points:[],complete:valid};result.push(session);}
    if(candle.time!==previous+step||![candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite)||candle.volume<0||candle.low<=0||candle.high<candle.low||candle.close<candle.low||candle.close>candle.high)valid=false;
    previous=candle.time;
    if(!valid){session!.complete=false;continue;}
    const hlc3=(candle.high+candle.low+candle.close)/3;
    weighted+=hlc3*candle.volume;total+=candle.volume;
    if(!Number.isFinite(total)||!Number.isFinite(weighted)){valid=false;session!.complete=false;continue;}
    if(total>0){const value=weighted/total;if(!Number.isFinite(value)||value<=0){valid=false;session!.complete=false;}else session!.points.push({time:candle.time,value});}
  }
  return result;
}
