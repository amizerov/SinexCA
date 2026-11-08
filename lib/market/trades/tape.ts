import type {TradeTick} from "./types";
/** Preserve distinct executions in a burst; prices may still be coalesced separately. */
export function mergeTrades(previous:TradeTick[],incoming:TradeTick[],limit=500){
  const seen=new Set<string>();
  return [...incoming,...previous].sort((a,b)=>b.time-a.time||b.receivedAt-a.receivedAt).filter(t=>{if(!t.id)return true;const key=`${t.symbol}:${t.id}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);
}
