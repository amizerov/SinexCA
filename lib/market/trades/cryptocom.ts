import {record,rows,tick,type TradeFactory} from "./types";
import {CRYPTOCOM_WS,cryptoReply,cryptoSubscription} from "../venue-streams";
export const cryptocomTrades:TradeFactory=pairs=>({url:CRYPTOCOM_WS,subscriptions:[cryptoSubscription(pairs.map(p=>`trade.${p.symbol}`))],subscribeDelayMs:1000,reply:cryptoReply,decode(input){
  const result=record(record(input).result);
  return result.channel==="trade"?rows(result.data).flatMap(value=>{const r=record(value);return tick(r.i??result.instrument_name,r.p,r.t,r.q,r.s,r.d);}).sort((a,b)=>a.time-b.time):[];
}});
