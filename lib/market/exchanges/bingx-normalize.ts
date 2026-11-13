import {z} from "zod";
import {choosePairs} from "../exchange-config";
import {MarketError} from "../errors";
import {normalizeCandles,normalizeTickerBatch} from "../normalize";
import type {TradingPair} from "../types";

const object=z.record(z.string(),z.unknown());

export function bingxData(input:unknown){
  const envelope=object.parse(input);
  if(envelope.code!==0)throw new MarketError("UPSTREAM_ERROR",`BingX: ${String(envelope.msg||"ошибка API")}`);
  return envelope.data;
}

export function bingxPairs(input:unknown,quoteFilter:string|null="USDT"):TradingPair[]{
  const data=object.parse(bingxData(input)),pairs:TradingPair[]=[];
  for(const row of z.array(object).parse(data.symbols)){
    if(row.status!==1||typeof row.symbol!=="string")continue;
    const [base,quote]=row.symbol.split("-");
    if(base&&quote&&(quoteFilter===null||quote===quoteFilter))pairs.push({exchange:"bingx",marketType:"spot",symbol:row.symbol,baseAsset:base,quoteAsset:quote});
  }
  return choosePairs(pairs);
}

export function bingxTickers(input:unknown,symbols?:string[],receivedAt=Date.now()){
  const allowed=symbols?new Set(symbols):undefined;
  const rows=z.array(object).parse(bingxData(input)).filter(row=>!allowed||allowed.has(String(row.symbol)));
  return normalizeTickerBatch(rows.map(row=>({
    symbol:row.symbol,lastPrice:row.lastPrice,
    priceChangePercent:String(row.priceChangePercent??"").replace("%",""),
    quoteVolume:row.quoteVolume,volume:row.volume,bidPrice:row.bidPrice,askPrice:row.askPrice,
    bidQty:row.bidQty??null,askQty:row.askQty??null,highPrice:row.highPrice,lowPrice:row.lowPrice,closeTime:row.closeTime,
  })),receivedAt,"bingx");
}

export function bingxCandles(input:unknown){
  return normalizeCandles(z.array(z.array(z.unknown())).parse(bingxData(input)).map(row=>[row[0],row[1],row[2],row[3],row[4],row[5]]));
}
