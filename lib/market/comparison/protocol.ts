import type {ExchangeId,TradingPair} from "../types";
import {object} from "../orderbook/model";
import type {ComparisonQuote} from "./model";
const positive=(value:unknown)=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
const quantity=(value:unknown)=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
export function comparisonProtocol(exchange:ExchangeId,pairs:TradingPair[]){
  if(!["binance","bybit","okx"].includes(exchange)||!pairs.length)return undefined;
  const bySymbol=new Map(pairs.map(pair=>[pair.symbol,pair]));
  const url=exchange==="binance"?`wss://data-stream.binance.vision/stream?streams=${pairs.map(pair=>`${pair.symbol.toLowerCase()}@bookTicker`).join("/")}`:exchange==="bybit"?"wss://stream.bybit.com/v5/public/spot":"wss://ws.okx.com:8443/ws/v5/public";
  const subscriptions=exchange==="bybit"?Array.from({length:Math.ceil(pairs.length/10)},(_,index)=>({op:"subscribe",args:pairs.slice(index*10,index*10+10).map(pair=>`tickers.${pair.symbol}`)})):exchange==="okx"?[{op:"subscribe",args:pairs.map(pair=>({channel:"tickers",instId:pair.symbol}))}]:[];
  return {url,subscriptions,ping:exchange==="bybit"?JSON.stringify({op:"ping"}):exchange==="okx"?"ping":undefined,decode(input:unknown,now=Date.now()):ComparisonQuote[]{
    const root=object(input);if(root.event==="error"||root.success===false)throw new Error("Биржа отклонила подписку.");
    const rows=exchange==="okx"?Array.isArray(root.data)?root.data:[]:[exchange==="binance"?object(root.data):object(root.data)];
    const quotes:ComparisonQuote[]=[];
    for(const raw of rows){
      const data=object(raw),symbol=String(exchange==="binance"?data.s:exchange==="bybit"?data.symbol:data.instId),pair=bySymbol.get(symbol);
      if(!pair)continue;
      if(exchange==="bybit"&&(root.topic!==`tickers.${symbol}`||root.type!=="snapshot"))continue;
      if(exchange==="okx"&&object(root.arg).channel!=="tickers")continue;
      const timestamp=exchange==="bybit"?Number(root.ts):exchange==="okx"?Number(data.ts):now;
      if(!Number.isFinite(timestamp)||Math.abs(now-timestamp)>15000)continue;
      const bid=positive(exchange==="binance"?data.b:exchange==="bybit"?data.bid1Price:data.bidPx),ask=positive(exchange==="binance"?data.a:exchange==="bybit"?data.ask1Price:data.askPx);
      if(bid===null||ask===null||bid>ask)continue;
      quotes.push({exchange,asset:pair.baseAsset,symbol,bid,ask,bidSize:quantity(exchange==="binance"?data.B:exchange==="bybit"?data.bid1Size:data.bidSz),askSize:quantity(exchange==="binance"?data.A:exchange==="bybit"?data.ask1Size:data.askSz),last:positive(exchange==="bybit"?data.lastPrice:data.last),receivedAt:now,source:"ws"});
    }
    return quotes;
  }};
}
