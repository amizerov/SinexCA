import type {Candle} from "../types";

export interface LiquidityZone {side:"support"|"resistance";lower:number;upper:number;confirmedAt:number;endedAt?:number}
/** Confirmed pivots only. These are price-derived areas, not observed orders or stop volumes. */
export function liquidityZones(candles:Candle[],lookback=5):LiquidityZone[]{
  if(!Number.isInteger(lookback)||lookback<2)throw new Error("Invalid pivot window");
  const closed=candles.slice(0,-1),zones:LiquidityZone[]=[];
  for(let i=0;i<closed.length;i++){
    const candle=closed[i];
    for(const zone of zones)if(zone.endedAt===undefined&&((zone.side==="support"&&candle.close<zone.lower)||(zone.side==="resistance"&&candle.close>zone.upper)))zone.endedAt=candle.time;
    if(i<lookback*2)continue;
    const center=i-lookback,pivot=closed[center],window=closed.slice(center-lookback,i+1);
    const past=closed.slice(center-lookback,center);
    const high=pivot.high===Math.max(...window.map(c=>c.high))&&pivot.high>Math.max(...past.map(c=>c.high));
    const low=pivot.low===Math.min(...window.map(c=>c.low))&&pivot.low<Math.min(...past.map(c=>c.low));
    const ranges=closed.slice(Math.max(0,i-13),i+1).map((c,index)=>{const previous=closed[Math.max(0,i-13)+index-1]?.close??c.open;return Math.max(c.high-c.low,Math.abs(c.high-previous),Math.abs(c.low-previous));});
    const halfWidth=Math.max(ranges.reduce((sum,value)=>sum+value,0)/ranges.length*.08,pivot.close*.00005);
    for(const [detected,side,price] of [[high,"resistance",pivot.high],[low,"support",pivot.low]] as const){
      if(!detected||zones.some(zone=>zone.side===side&&zone.endedAt===undefined&&price>=zone.lower-halfWidth&&price<=zone.upper+halfWidth))continue;
      zones.push({side,lower:price-halfWidth,upper:price+halfWidth,confirmedAt:candle.time});
    }
  }
  const last=closed.at(-1);if(!last)return [];
  const active=(["support","resistance"] as const).flatMap(side=>zones.filter(z=>z.side===side&&z.endedAt===undefined).sort((a,b)=>Math.abs((a.lower+a.upper)/2-last.close)-Math.abs((b.lower+b.upper)/2-last.close)).slice(0,3));
  const historical=zones.filter(z=>z.endedAt!==undefined).sort((a,b)=>b.endedAt!-a.endedAt!).slice(0,6);
  return [...historical,...active].sort((a,b)=>a.confirmedAt-b.confirmedAt);
}
