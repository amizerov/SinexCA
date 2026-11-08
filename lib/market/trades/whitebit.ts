import {record,rows,tick,type TradeFactory} from "./types";
import {WHITEBIT_WS,WHITEBIT_PING} from "../venue-streams";
export const whitebitTrades:TradeFactory=pairs=>({url:WHITEBIT_WS,subscriptions:[{id:1,method:"trades_subscribe",params:pairs.map(p=>p.symbol)}],ping:WHITEBIT_PING,decode(input){
  const event=record(input),params=rows(event.params);
  return event.method==="trades_update"?rows(params[1]).flatMap(value=>{const r=record(value);return tick(params[0],r.price,Number(r.time)*1000,r.amount,r.type,r.id);}).sort((a,b)=>a.time-b.time):[];
}});
