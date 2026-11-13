import {z} from "zod";
import {choosePairs} from "../exchange-config";
import {normalizeCandles,normalizeTickerBatch} from "../normalize";
import type {TradingPair} from "../types";

// Gemini symbols have no separator. Quote assets are ordered longest-first so
// btcusdt is parsed as BTC/USDT rather than BTCUS/DT, while efilfil remains EFIL/FIL.
const quoteAssets=["PYUSD","RLUSD","GUSD","USDT","USDC","USD","EUR","GBP","SGD","BTC","ETH","FIL"];
const record=z.record(z.string(),z.unknown());

export function geminiPairs(input:unknown,quoteFilter:string|null="USD"):TradingPair[]{
  const pairs=z.array(z.string()).parse(input).flatMap(symbol=>{
    const normalized=symbol.toLowerCase();
    if(normalized.endsWith("perp"))return [];
    const quote=quoteAssets.find(asset=>normalized.endsWith(asset.toLowerCase()));
    if(!quote)return [];
    const base=normalized.slice(0,-quote.length).toUpperCase();
    if(!base||quoteFilter!==null&&quote!==quoteFilter)return [];
    return [{exchange:"gemini" as const,marketType:"spot" as const,symbol:normalized,baseAsset:base,quoteAsset:quote}];
  });
  return choosePairs([...new Map(pairs.map(pair=>[pair.symbol,pair])).values()]);
}

export function geminiCandles(input:unknown){
  return normalizeCandles(z.array(z.array(z.unknown())).parse(input).map(row=>[row[0],row[1],row[2],row[3],row[4],row[5]]));
}

export function geminiTicker(input:unknown){
  const item=record.parse(input),open=Number(item.open),close=Number(item.close);
  return normalizeTickerBatch([{
    symbol:String(item.symbol).toLowerCase(),lastPrice:item.close,
    priceChangePercent:Number.isFinite(open)&&open>0?(close-open)/open*100:null,
    quoteVolume:null,volume:undefined,bidPrice:item.bid??null,askPrice:item.ask??null,bidQty:null,askQty:null,
    highPrice:item.high,lowPrice:item.low,closeTime:null,
  }],Date.now(),"gemini");
}

export function geminiOverview(input:unknown){
  return normalizeTickerBatch(z.array(record).parse(input).map(item=>({
    symbol:String(item.pair).toLowerCase(),lastPrice:item.price,priceChangePercent:item.percentChange24h??null,
    quoteVolume:null,volume:undefined,bidPrice:null,askPrice:null,bidQty:null,askQty:null,
    // The price feed has no intraday extrema; exact values are refreshed for the selected pair.
    highPrice:item.price,lowPrice:item.price,closeTime:null,
  })),Date.now(),"gemini");
}
