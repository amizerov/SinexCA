import { marketRoute,parseQuery } from "@/lib/server/market-route";
import { marketListQuery } from "@/lib/market/schemas";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {filterQuote} from "@/lib/market/pair-selection";
import { getExchange } from "@/lib/market/service";
export const dynamic="force-dynamic";
export function GET(request:Request){
  return marketRoute(request,async()=>{
    const query=parseQuery(marketListQuery,request),adapter=getExchange(query.exchange);
    const pairs=filterQuote(await adapter.getPairs(),query.quote||EXCHANGES[query.exchange].quote),allowed=new Set(pairs.map(pair=>pair.symbol));
    const tickers=await (adapter.getOverview?adapter.getOverview():adapter.getTickers([...allowed]));
    return tickers.filter(ticker=>allowed.has(ticker.symbol));
  });
}
