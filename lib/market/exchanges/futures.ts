import "server-only";
import {marketCache} from "@/lib/server/cache";
import {fetchJson} from "@/lib/server/fetch-json";
import {MarketError} from "../errors";
import {normalizeCandles,mergeCandles} from "../normalize";
import {restInterval} from "../intervals";
import {marketTimeframes,supportsFutures} from "../market-type";
import type {Candle,ExchangeId} from "../types";
import type {ExchangeAdapter} from "./adapter";
import {futuresPairs,futuresTickers} from "./futures-normalize";
import {record,unwrap} from "./foreign-normalize";
import {z} from "zod";
import {createExtraFuturesExchange} from "./futures-extra";

const origins={binance:"https://fapi.binance.com",bybit:"https://api.bybit.com",okx:"https://www.okx.com"};
const adapters=new Map<ExchangeId,ExchangeAdapter>();
export function getFuturesExchange(exchange:ExchangeId):ExchangeAdapter{
  if(!supportsFutures(exchange))throw new MarketError("UNSUPPORTED_MARKET","Фьючерсы этой биржи недоступны.",400);
  const existing=adapters.get(exchange);if(existing)return existing;
  if(exchange!=="binance"&&exchange!=="bybit"&&exchange!=="okx"){const adapter=createExtraFuturesExchange(exchange);adapters.set(exchange,adapter);return adapter;}
  const id=exchange as keyof typeof origins;
  const request=(path:string,params:Record<string,string>={})=>{const url=new URL(path,origins[id]);url.search=new URLSearchParams(params).toString();return fetchJson(url);};
  const overview=()=>marketCache.get(`${id}:futures:overview`,5000,async()=>futuresTickers(id,await request(id==="binance"?"/fapi/v1/ticker/24hr":id==="bybit"?"/v5/market/tickers":"/api/v5/market/tickers",id==="bybit"?{category:"linear"}:id==="okx"?{instType:"SWAP"}:{}),await adapter.getPairs()));
  const adapter:ExchangeAdapter={id,
    getPairs:()=>marketCache.get(`${id}:futures:catalog`,3600000,async()=>{
      if(id!=="bybit")return futuresPairs(id,await request(id==="binance"?"/fapi/v1/exchangeInfo":"/api/v5/public/instruments",id==="okx"?{instType:"SWAP"}:{}));
      const list:unknown[]=[];let cursor="";
      do{const input=await request("/v5/market/instruments-info",{category:"linear",limit:"1000",...cursor?{cursor}:{}});unwrap(id,input);const result=record.parse(record.parse(input).result);list.push(...z.array(z.unknown()).parse(result.list));const next=String(result.nextPageCursor||"");if(next&&next===cursor)throw new MarketError("INVALID_CATALOG","Bybit вернул повторную страницу инструментов.");cursor=next;}while(cursor);
      return futuresPairs(id,{retCode:0,result:{list}});
    }),
    getOverview:overview,
    getTickers:async symbols=>{const allowed=new Set(symbols);return (await overview()).filter(ticker=>allowed.has(ticker.symbol));},
    getCandles:params=>marketCache.get(`${id}:futures:candles:${params.symbol}:${params.timeframe}:${params.limit}:${params.endTime??"latest"}`,10000,async()=>{
      const {symbol,timeframe,limit,endTime}=params;
      if(!marketTimeframes(id,"futures").includes(timeframe))throw new MarketError("INVALID_INTERVAL","Этот интервал недоступен для фьючерсов.",400);
      const bar=restInterval(id,timeframe);
      if(id==="binance")return normalizeCandles(await request("/fapi/v1/klines",{symbol,interval:bar,limit:String(limit),...endTime!==undefined?{endTime:String(endTime*1000)}:{}}));
      if(id==="bybit")return normalizeCandles(unwrap(id,await request("/v5/market/kline",{category:"linear",symbol,interval:bar,limit:String(limit),...endTime!==undefined?{end:String(endTime*1000)}:{}})));
      let candles:Candle[]=[],after=endTime===undefined?undefined:String((endTime+1)*1000);
      for(let page=0;page<Math.ceil(limit/100)+2&&candles.length<limit;page++){
        const input=await request("/api/v5/market/history-candles",{instId:symbol,bar,limit:String(Math.min(100,limit-candles.length)),...after?{after}:{}});
        const rows=z.array(z.array(z.unknown())).parse(unwrap(id,input));
        const batch=normalizeCandles(rows.map(row=>[...row.slice(0,5),row[6]]));
        if(!batch.length)break;const next=String(batch[0].time*1000);if(next===after)break;
        candles=mergeCandles(candles,batch,limit+100);after=next;
      }
      return candles.slice(-limit);
    }),
  };
  adapters.set(id,adapter);return adapter;
}
