import {z} from "zod";
import {marketRoute,parseQuery} from "@/lib/server/market-route";
import {candleQuery} from "@/lib/market/schemas";
import {getExchange} from "@/lib/market/service";
import {MarketError} from "@/lib/market/errors";
import {marketCache} from "@/lib/server/cache";
import {intervalSeconds} from "@/lib/market/intervals";
import {loadProfileHistory,profileTimeframe} from "@/lib/indicators/profile-history";
export const dynamic="force-dynamic";
export const maxDuration=120;
const query=candleQuery.safeExtend({from:z.coerce.number().int().nonnegative(),to:z.coerce.number().int().positive()}).refine(q=>q.to>q.from&&q.to-q.from<=366*86400,"Слишком большой диапазон профиля.");
export function GET(request:Request){return marketRoute(request,async()=>{
  const {exchange,symbol,timeframe,from,to}=parseQuery(query,request),adapter=getExchange(exchange);
  const pair=(await adapter.getPairs()).find(pair=>pair.symbol===symbol);
  if(!pair)throw new MarketError("INVALID_SYMBOL","Торговая пара недоступна.",400);
  const source=profileTimeframe(exchange,timeframe,to-from),step=intervalSeconds(source);
  const start=Math.floor(from/step)*step,finish=Math.min(Math.ceil(to/step)*step,Math.floor(Date.now()/1000/step)*step+step);
  return marketCache.get(`profile:v1:${exchange}:spot:${symbol}:${source}:${start}:${finish}`,15000,async()=>({
    ...await loadProfileHistory(adapter.getCandles,symbol,source,start,finish,exchange==="htx"?2000:exchange==="kraken"?720:1000),tick:pair.priceIncrement??null,
  }));
});}
