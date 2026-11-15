import type {Candle,ExchangeId,Timeframe} from "@/lib/market/types";
import {exchangeTimeframes,intervalSeconds} from "@/lib/market/intervals";
import type {CandlePage} from "./vwap-history";
export interface ProfileHistory {candles:Candle[];timeframe:Timeframe;from:number;to:number;complete:boolean;tick:number|null}
/** Prefer fine candles; bound range loading to 10,000 candles and 20 serial pages. */
export function profileTimeframe(exchange:ExchangeId,chart:Timeframe,span:number):Timeframe{
  const candidates=exchangeTimeframes(exchange).filter(tf=>intervalSeconds(tf)<=Math.max(60,intervalSeconds(chart)));
  return candidates.find(tf=>intervalSeconds(tf)>=Math.min(60,intervalSeconds(chart))&&span/intervalSeconds(tf)<=9500)??candidates.at(-1)??chart;
}
export async function loadProfileHistory(loader:CandlePage,symbol:string,timeframe:Timeframe,from:number,to:number,pageSize=1000):Promise<ProfileHistory>{
  const seconds=intervalSeconds(timeframe),map=new Map<number,Candle>();let endTime=to-1;
  for(let page=0;page<20;page++){
    const batch=await loader({symbol,timeframe,limit:pageSize,endTime});
    const accepted=batch.filter(c=>Number.isFinite(c.time)&&c.time<=endTime);
    if(!accepted.length)break;
    for(const c of accepted)if(c.time>=from&&c.time<to)map.set(c.time,c);
    const first=Math.min(...accepted.map(c=>c.time));
    if(first<=from||first>=endTime||map.size>=10000)break;
    endTime=first-1;
  }
  const candles=[...map.values()].sort((a,b)=>a.time-b.time);
  const complete=candles.length>0&&candles[0].time===from&&candles.at(-1)!.time+seconds>=to&&candles.every((c,i)=>!i||c.time-candles[i-1].time===seconds);
  return {candles,timeframe,from,to,complete,tick:null};
}
