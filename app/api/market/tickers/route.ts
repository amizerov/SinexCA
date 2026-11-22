import { marketRoute, parseQuery } from "@/lib/server/market-route";
import { tickerQuery } from "@/lib/market/schemas";
import { getExchange, validateSymbols } from "@/lib/market/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return marketRoute(request, async () => {
    const { exchange,marketType, symbols } = parseQuery(tickerQuery, request);
    await validateSymbols(exchange, symbols,marketType);
    return getExchange(exchange,marketType).getTickers(symbols);
  });
}
