import { marketRoute, parseQuery } from "@/lib/server/market-route";
import { candleQuery } from "@/lib/market/schemas";
import { getExchange, validateSymbols } from "@/lib/market/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return marketRoute(request, async () => {
    const { exchange, ...params } = parseQuery(candleQuery, request);
    await validateSymbols(exchange, [params.symbol]);
    return getExchange(exchange).getCandles(params);
  });
}
