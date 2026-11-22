import {z} from "zod";
import {normalizeTickerBatch} from "../normalize";
import {priceIncrement} from "../price-increment";
import type {ExchangeId,TradingPair} from "../types";
import {foreignTickers,unwrap,record} from "./foreign-normalize";
import {futuresContractInfo} from "../futures-settings";

export function futuresPairs(exchange:ExchangeId,input:unknown):TradingPair[]{
  const rows=z.array(record).parse(exchange==="binance"?record.parse(input).symbols:unwrap(exchange,input));
  return rows.flatMap(row=>{
    const active=exchange==="binance"?row.status==="TRADING"&&row.contractType==="PERPETUAL"&&row.quoteAsset==="USDT":exchange==="bybit"?row.status==="Trading"&&row.contractType==="LinearPerpetual"&&row.settleCoin==="USDT":row.state==="live"&&row.instType==="SWAP"&&row.ctType==="linear"&&row.settleCcy==="USDT";
    if(!active)return [];
    const symbol=z.string().min(1).parse(row.symbol??row.instId),baseAsset=z.string().min(1).parse(row.baseAsset??row.baseCoin??row.ctValCcy);
    const contractSize=exchange==="okx"?z.coerce.number().positive().finite().parse(row.ctVal):1;
    return [{exchange,marketType:"futures" as const,symbol,baseAsset,quoteAsset:"USDT",contractSize,futuresInfo:futuresContractInfo(exchange,row,contractSize),...priceIncrement(exchange,row)}];
  }).sort((a,b)=>(a.baseAsset==="BTC"?-1:b.baseAsset==="BTC"?1:a.baseAsset.localeCompare(b.baseAsset)));
}

export function futuresTickers(exchange:ExchangeId,input:unknown,pairs:TradingPair[]){
  const allowed=new Map(pairs.map(pair=>[pair.symbol,pair]));
  if(exchange==="bybit")return foreignTickers(exchange,input,[...allowed.keys()]);
  const rows=z.array(record).parse(exchange==="binance"?input:unwrap(exchange,input));
  return normalizeTickerBatch(rows.filter(row=>allowed.has(String(row.symbol??row.instId))).map(row=>{
    if(exchange==="binance")return {...row,bidPrice:null,askPrice:null,bidQty:null,askQty:null};
    const pair=allowed.get(String(row.instId))!,size=pair.contractSize??1,open=Number(row.open24h),last=Number(row.last);
    return {symbol:row.instId,lastPrice:row.last,priceChangePercent:open>0?(last/open-1)*100:null,quoteVolume:null,volume:row.volCcy24h,bidPrice:row.bidPx,askPrice:row.askPx,bidQty:Number(row.bidSz)*size,askQty:Number(row.askSz)*size,highPrice:row.high24h,lowPrice:row.low24h,closeTime:row.ts};
  }),Date.now(),exchange);
}
