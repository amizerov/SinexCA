import { marketRoute, parseQuery } from "@/lib/server/market-route";
import { candleQuery } from "@/lib/market/schemas";
import { getExchange, validateSymbols } from "@/lib/market/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return marketRoute(request, async () => {
    const { exchange,marketType, ...params } = parseQuery(candleQuery, request);
    await validateSymbols(exchange, [params.symbol],marketType);
    return getExchange(exchange,marketType).getCandles(params);
  });
}
