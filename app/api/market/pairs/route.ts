import { marketRoute, parseQuery } from "@/lib/server/market-route";
import { marketListQuery } from "@/lib/market/schemas";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {filterQuote} from "@/lib/market/pair-selection";
import { getExchange } from "@/lib/market/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return marketRoute(request, async () => {
    const query=parseQuery(marketListQuery,request);
    return filterQuote(await getExchange(query.exchange).getPairs(),query.quote||EXCHANGES[query.exchange].quote);
  });
}
