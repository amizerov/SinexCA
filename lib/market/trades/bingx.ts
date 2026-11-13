import {record,rows,tick,type TradeFactory} from "./types";

export const bingxTrades:TradeFactory=pairs=>({
  url:"wss://open-api-ws.bingx.com/market",
  subscriptions:pairs.map(pair=>({id:crypto.randomUUID(),reqType:"sub",dataType:`${pair.symbol}@trade`})),
  reply(input){const event=record(input);return event.ping?{pong:event.ping,time:event.time}:undefined;},
  isSubscribed(input){const event=record(input);return event.code===0&&typeof event.id==="string";},
  decode(input){
    const event=record(input),dataType=String(event.dataType||"");
    const pair=pairs.find(value=>dataType===`${value.symbol}@trade`);if(!pair)return [];
    const values=Array.isArray(event.data)?rows(event.data):[event.data];
    return values.flatMap(value=>{const row=record(value);return tick(pair.symbol,row.p,row.T,row.q,row.m===true?"sell":row.m===false?"buy":undefined,row.t);}).sort((a,b)=>a.time-b.time);
  },
});
