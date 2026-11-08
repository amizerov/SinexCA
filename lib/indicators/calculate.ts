import type { Candle } from "@/lib/market/types";
export interface IndicatorPoint {time:number;value:number}
function check(period:number){if(!Number.isInteger(period)||period<2||period>200)throw new RangeError("Period must be between 2 and 200");}
export function sma(candles:Candle[],period:number):IndicatorPoint[]{
  check(period);let sum=0;const points:IndicatorPoint[]=[];
  for(let i=0;i<candles.length;i++){sum+=candles[i].close;if(i>=period)sum-=candles[i-period].close;if(i>=period-1)points.push({time:candles[i].time,value:sum/period});}
  return points;
}
/** Seed EMA with the first period's SMA; recompute current candle without accumulating intrabar ticks. */
export function ema(candles:Candle[],period:number):IndicatorPoint[]{
  check(period);if(candles.length<period)return [];const points:IndicatorPoint[]=[];
  let value=candles.slice(0,period).reduce((sum,c)=>sum+c.close,0)/period;const alpha=2/(period+1);
  points.push({time:candles[period-1].time,value});
  for(let i=period;i<candles.length;i++){value+=alpha*(candles[i].close-value);points.push({time:candles[i].time,value});}
  return points;
}
/** Wilder's RSI: initial mean of N price changes, followed by RMA smoothing. */
export function rsi(candles:Candle[],period:number):IndicatorPoint[]{
  check(period);if(candles.length<=period)return [];let gain=0,loss=0;const points:IndicatorPoint[]=[];
  for(let i=1;i<candles.length;i++){
    const change=candles[i].close-candles[i-1].close,up=Math.max(0,change),down=Math.max(0,-change);
    if(i<=period){gain+=up/period;loss+=down/period;}else{gain=(gain*(period-1)+up)/period;loss=(loss*(period-1)+down)/period;}
    if(i>=period)points.push({time:candles[i].time,value:loss===0?(gain===0?50:100):100-100/(1+gain/loss)});
  }
  return points;
}
