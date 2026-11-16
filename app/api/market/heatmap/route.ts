import {z} from "zod";
import {marketRoute,parseQuery} from "@/lib/server/market-route";
import {symbolSchema} from "@/lib/market/schemas";
import {validateSymbols} from "@/lib/market/service";
import {fetchJson} from "@/lib/server/fetch-json";
import {marketCache} from "@/lib/server/cache";

export const dynamic="force-dynamic";
export function GET(request:Request){return marketRoute(request,async()=>{
  const {symbol}=parseQuery(z.object({exchange:z.literal("binance"),symbol:symbolSchema}),request);
  await validateSymbols("binance",[symbol]);
  return marketCache.get(`heat-depth:${symbol}`,1000,()=>fetchJson(new URL(`https://data-api.binance.vision/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=5000`)));
});}
