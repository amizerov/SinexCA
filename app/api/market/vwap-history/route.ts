import {marketRoute,parseQuery} from "@/lib/server/market-route";
import {candleQuery} from "@/lib/market/schemas";
import {getExchange,validateSymbols} from "@/lib/market/service";
import {marketCache} from "@/lib/server/cache";
import {loadVwapSession} from "@/lib/indicators/vwap-history";
import {isVwapTimeframe,utcSession} from "@/lib/indicators/vwap";
export const dynamic="force-dynamic";
export const maxDuration=120;
const query=candleQuery.refine(value=>isVwapTimeframe(value.timeframe),"Дневной VWAP доступен только на внутридневных интервалах.");
export function GET(request:Request){return marketRoute(request,async()=>{
  const {exchange,symbol,timeframe}=parseQuery(query,request);await validateSymbols(exchange,[symbol]);
  const now=Math.floor(Date.now()/1000),adapter=getExchange(exchange);
  return marketCache.get(`vwap:v1:${exchange}:spot:${symbol}:${timeframe}:${utcSession(now)}`,10000,()=>loadVwapSession(adapter.getCandles,symbol,timeframe,now,exchange==="htx"?2000:exchange==="kraken"?720:1000));
});}
