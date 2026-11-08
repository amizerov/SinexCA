import {marketRoute,parseQuery} from "@/lib/server/market-route";
import {exchangeQuery,symbolSchema} from "@/lib/market/schemas";
import {validateSymbols} from "@/lib/market/service";
import {getOrderBook} from "@/lib/market/orderbook/rest";
export const dynamic="force-dynamic";
export function GET(request:Request){return marketRoute(request,async()=>{
  const {exchange,symbol}=parseQuery(exchangeQuery.extend({symbol:symbolSchema}),request);
  await validateSymbols(exchange,[symbol]);return getOrderBook(exchange,symbol);
});}
