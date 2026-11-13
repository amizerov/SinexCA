import {record,tick,type TradeFactory} from "./types";

export const geminiTrades:TradeFactory=pairs=>({
  url:"wss://ws.gemini.com",
  subscriptions:[{id:"sinex-trades",method:"SUBSCRIBE",params:pairs.map(pair=>`${pair.symbol.toLowerCase()}@trade`)}],
  decode(input){
    const event=record(input),symbol=String(event.s||"").toLowerCase();
    const pair=pairs.find(value=>value.symbol.toLowerCase()===symbol);
    if(!pair||event.p==null||event.E==null)return [];
    // Gemini's current stream timestamps are nanoseconds; TradeTick uses milliseconds.
    const side=event.m===true?"sell":event.m===false?"buy":undefined;
    return tick(pair.symbol,event.p,Math.floor(Number(event.E)/1_000_000),event.q,side,event.t);
  },
});
