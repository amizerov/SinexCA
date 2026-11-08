import { z } from "zod";
import { choosePairs } from "../exchange-config";
import { normalizeCandles,normalizeTickerBatch } from "../normalize";
import type { TradingPair } from "../types";
const record=z.record(z.string(),z.unknown());
export function cryptocomResult(input:unknown){const root=record.parse(input);if(root.code!==0)throw new Error("Crypto.com API error");return record.parse(root.result);}
export function cryptocomPairs(input:unknown,quoteFilter:string|null="USDT"):TradingPair[]{return choosePairs(z.array(record).parse(cryptocomResult(input).data).filter(r=>r.inst_type==="CCY_PAIR"&&r.tradable===true&&(quoteFilter===null||r.quote_ccy===quoteFilter)).map(r=>({exchange:"cryptocom",marketType:"spot",symbol:z.string().parse(r.symbol),baseAsset:z.string().parse(r.base_ccy),quoteAsset:z.string().parse(r.quote_ccy)})));}
export function cryptocomCandles(input:unknown){return normalizeCandles(z.array(record).parse(input).map(r=>[r.t,r.o,r.h,r.l,r.c,r.v]));}
export function cryptocomTickers(input:unknown,symbols:string[]){
  const allowed=new Set(symbols);
  // The API documents vv in USD, not USDT. Keep base volume for the UI's labelled estimate.
  return normalizeTickerBatch(z.array(record).parse(cryptocomResult(input).data).filter(r=>allowed.has(String(r.i))).map(r=>({symbol:r.i,lastPrice:r.a,priceChangePercent:r.c==null?null:Number(r.c)*100,quoteVolume:null,volume:r.v,bidPrice:r.b??null,askPrice:r.k??null,bidQty:null,askQty:null,highPrice:r.h,lowPrice:r.l,closeTime:r.t??null})),Date.now(),"cryptocom");
}
