import type {Candle,ExchangeId,Timeframe} from "@/lib/market/types";
import {shiftInterval} from "@/lib/market/intervals";
import type {DemoFill} from "./orders";
export interface ChartExecution {id:string;time:number;side:"buy"|"sell";price:number;quantity:number;feeUnits:number;quoteUnits:number;base:string;quote:string;firstAt:number;lastAt:number;count:number;orderId:string}
/** Match actual candle openings, including calendar intervals and gaps. */
export function chartExecutions(fills:DemoFill[],candles:Pick<Candle,"time">[],exchange:ExchangeId,symbol:string,timeframe:Timeframe){
  const groups=new Map<string,ChartExecution>(),seen=new Set<string>();let outside=0;
  for(const f of fills){
    if(f.exchange!==exchange||f.symbol!==symbol||!f.side||!f.base||!f.quote||seen.has(f.id)||!Number.isFinite(f.price)||f.price<=0||!Number.isFinite(f.quantity)||f.quantity<=0)continue;
    seen.add(f.id);const at=f.exchangeTime??f.receivedAt,time=at/1000;let lo=0,hi=candles.length-1,index=-1;
    while(lo<=hi){const mid=(lo+hi)>>>1;if(candles[mid].time<=time){index=mid;lo=mid+1;}else hi=mid-1;}
    const candle=candles[index],end=candle?Math.min(candles[index+1]?.time??Infinity,shiftInterval(candle.time,timeframe,1)):0;
    if(!candle||time>=end){outside++;continue;}
    const id=`${f.orderId}:${candle.time}:${f.side}`,old=groups.get(id),quantity=f.quantity/1e8;
    if(old){old.price=(old.price*old.quantity+f.price*quantity)/(old.quantity+quantity);old.quantity+=quantity;old.feeUnits+=f.feeUnits;old.quoteUnits+=f.quoteUnits;old.firstAt=Math.min(old.firstAt,at);old.lastAt=Math.max(old.lastAt,at);old.count++;}
    else groups.set(id,{id,time:candle.time,side:f.side,price:f.price,quantity,feeUnits:f.feeUnits,quoteUnits:f.quoteUnits,base:f.base,quote:f.quote,firstAt:at,lastAt:at,count:1,orderId:f.orderId});
  }
  return {markers:[...groups.values()].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)),outside};
}
