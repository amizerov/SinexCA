import "server-only";
import {cachedAdapter,exchangeRequest} from "./shared";
import {restInterval} from "../intervals";
import {cryptocomPairs,cryptocomResult,cryptocomCandles,cryptocomTickers} from "./cryptocom-normalize";
import {mergeCandles} from "../normalize";
import type {Candle,TradingPair} from "../types";
const request=exchangeRequest("https://api.crypto.com");
export const cryptocom=cachedAdapter({
  id:"cryptocom",
  getPairs:async()=>{
    const pairs:TradingPair[]=[],seen=new Set<string>();let cursor="";
    do{
      const input=await request("/exchange/v1/public/get-instruments",cursor?{cursor}:{});
      pairs.push(...cryptocomPairs(input,null));
      const next=cryptocomResult(input).next_cursor;
      cursor=typeof next==="string"?next:"";
      if(cursor){if(seen.has(cursor)||seen.size>=20)throw new Error("Crypto.com catalog pagination failed");seen.add(cursor);}
    }while(cursor);
    return [...new Map(pairs.map(pair=>[pair.symbol,pair])).values()];
  },
  getTickers:async symbols=>cryptocomTickers(await request("/exchange/v1/public/get-tickers",symbols.length===1?{instrument_name:symbols[0]}:{}),symbols),
  getCandles:async({symbol,timeframe,limit,endTime})=>{
    let candles:Candle[]=[],end=endTime===undefined?"":String(endTime*1000);
    // The live API caps one response at 300 candles even when count is larger.
    for(let page=0;page<Math.ceil(limit/300)+2&&candles.length<limit;page++){
      const batch=cryptocomCandles(cryptocomResult(await request("/exchange/v1/public/get-candlestick",{instrument_name:symbol,timeframe:restInterval("cryptocom",timeframe),count:String(Math.min(300,limit-candles.length)),...end?{end_ts:end}:{}})).data);
      if(!batch.length)break;
      const next=String(batch[0].time*1000-1);if(end&&Number(next)>=Number(end))break;
      candles=mergeCandles(batch,candles,limit);end=next;
    }
    return candles;
  },
});
