import type {Candle} from "@/lib/market/types";
export const PROFILE_METHOD="Объём базового актива равномерно распределяется по диапазону low–high каждой свечи с учётом пересечения ценовых уровней. Это приближение, а не история сделок.";
export interface ProfileBin {low:number;high:number;volume:number}
export interface VolumeProfile {bins:ProfileBin[];total:number;poc:number|null;maximum:number}
/** Snapshot calculation: the latest occurrence of a candle timestamp replaces earlier snapshots. */
export function candleVolumeProfile(input:Candle[],levels:number,tick:number):VolumeProfile{
  const empty:VolumeProfile={bins:[],total:0,poc:null,maximum:0};
  if(!Number.isInteger(levels)||levels<5||levels>200||!Number.isFinite(tick)||tick<=0)return empty;
  const candles=[...new Map(input.map(c=>[c.time,c])).values()].filter(c=>[c.time,c.low,c.high,c.volume].every(Number.isFinite)&&c.low>0&&c.high>=c.low&&c.volume>=0);
  if(!candles.length)return empty;
  const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high));
  const start=Math.floor(low/tick+1e-8),end=Math.ceil(high/tick-1e-8);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return empty;
  // Integer tick boundaries. The requested row count is an upper bound when the range is narrower than one tick per row.
  const step=Math.max(1,Math.ceil((end-start)/levels)),size=step*tick,count=Math.max(1,Math.ceil((end-start)/step));
  const base=start*tick,bins=Array.from({length:count},(_,i)=>({low:base+i*size,high:base+(i+1)*size,volume:0}));
  let total=0;
  for(const candle of candles){
    total+=candle.volume;
    const first=Math.max(0,Math.min(count-1,Math.floor((candle.low-base)/size+1e-9)));
    const last=Math.max(first,Math.min(count-1,Math.ceil((candle.high-base)/size-1e-9)-1));
    let remaining=candle.volume;
    for(let i=first;i<=last;i++){
      const allocation=i===last?remaining:candle.volume*Math.max(0,Math.min(candle.high,bins[i].high)-Math.max(candle.low,bins[i].low))/(candle.high-candle.low);
      bins[i].volume+=allocation;remaining-=allocation;
    }
  }
  const maximum=Math.max(...bins.map(bin=>bin.volume));
  const poc=maximum>0?bins.findIndex(bin=>bin.volume===maximum):null;
  return {bins,total,poc,maximum};
}
