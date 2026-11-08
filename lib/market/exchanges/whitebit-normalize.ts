import { z } from "zod";
import { choosePairs } from "../exchange-config";
import { normalizeCandles, normalizeTickerBatch } from "../normalize";
import type { TradingPair } from "../types";
const record=z.record(z.string(),z.unknown());
export function whitebitResult(input:unknown){const root=record.parse(input);if(root.success!==true)throw new Error("WhiteBIT API error");return root.result;}
export function whitebitPairs(input:unknown,quoteFilter:string|null="USDT"):TradingPair[]{
  return choosePairs(z.array(record).parse(input).filter(r=>r.type==="spot"&&r.tradesEnabled===true&&(quoteFilter===null||r.money===quoteFilter)&&r.delistedAt==null).map(r=>({exchange:"whitebit",marketType:"spot",symbol:z.string().parse(r.name),baseAsset:z.string().parse(r.stock),quoteAsset:z.string().parse(r.money)})));
}
export function whitebitCandles(input:unknown){return normalizeCandles(z.array(z.array(z.unknown())).parse(input).map(r=>[Number(r[0])*1000,r[1],r[3],r[4],r[2],r[5]]));}
export function whitebitTickers(input:unknown,symbols:string[]){
  const allowed=new Set(symbols);
  return normalizeTickerBatch(Object.entries(record.parse(whitebitResult(input))).filter(([symbol])=>allowed.has(symbol)).map(([symbol,value])=>{
    const item=record.parse(value),t=record.parse(item.ticker);
    return {symbol,lastPrice:t.last,priceChangePercent:t.change,quoteVolume:t.deal,volume:t.vol,bidPrice:t.bid,askPrice:t.ask,bidQty:null,askQty:null,highPrice:t.high,lowPrice:t.low,closeTime:Number(item.at)*1000};
  }),Date.now(),"whitebit");
}
