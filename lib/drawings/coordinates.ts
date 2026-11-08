import type { Candle } from "@/lib/market/types";
/** Persist UTC time/price, never screen pixels or an index tied to one timeframe. */
export function logicalAtTime(time:number,candles:Candle[]) {
  if(candles.length<2)return null;
  let left=0,right=candles.length-1;
  while(left<right){const mid=Math.floor((left+right)/2);if(candles[mid].time<time)left=mid+1;else right=mid;}
  const upper=Math.max(1,left),lower=upper-1;
  return lower+(time-candles[lower].time)/(candles[upper].time-candles[lower].time);
}
export function timeAtLogical(logical:number,candles:Candle[]) {
  if(candles.length<2)return null;
  const lower=Math.max(0,Math.min(candles.length-2,Math.floor(logical))),upper=lower+1;
  return Math.round(candles[lower].time+(logical-lower)*(candles[upper].time-candles[lower].time));
}
