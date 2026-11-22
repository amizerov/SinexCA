import {record,tick,type TradeFactory} from "./types";
export const binanceTrades:TradeFactory=pairs=>{
  const futures=pairs[0]?.marketType==="futures",eventName=futures?"aggTrade":"trade";
  return {url:futures?"wss://fstream.binance.com/market/stream":"wss://data-stream.binance.vision:443/stream",subscriptions:[{method:"SUBSCRIBE",params:pairs.map(p=>`${p.symbol.toLowerCase()}@${eventName}`),id:1}],decode(input){const event=record(record(input).data);return event.e===eventName?tick(event.s,event.p,event.T,event.q,typeof event.m==="boolean"?(event.m?"sell":"buy"):undefined,futures?event.a:event.t):[];}};
};
