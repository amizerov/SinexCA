import "server-only";
import { marketCache } from "@/lib/server/cache";
import { fetchJson } from "@/lib/server/fetch-json";
import type { ExchangeAdapter } from "./adapter";
export { INTERVAL_MINUTES } from "../intervals";
export type CandleRequest = Parameters<ExchangeAdapter["getCandles"]>[0];
export function exchangeRequest(origin: string) {
  return (path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") => {
    const url = new URL(path, origin); url.search = new URLSearchParams(params).toString();
    return fetchJson(url, method);
  };
}
/** Only mechanics are shared. Each exchange owns its URLs, intervals and pagination. */
export function cachedAdapter(adapter: ExchangeAdapter, tickerTtl = 5000): ExchangeAdapter {
  const { id } = adapter;
  return {
    id,
    getPairs: () => marketCache.get(`${id}:catalog:v2`, 3600000, adapter.getPairs),
    getTickers: symbols => marketCache.get(`${id}:tickers:${[...new Set(symbols)].sort().join(",")}`, tickerTtl, () => adapter.getTickers([...new Set(symbols)])),
    getOverview: () => marketCache.get(`${id}:overview:v2`,15000,async()=>adapter.getOverview?adapter.getOverview():adapter.getTickers((await marketCache.get(`${id}:catalog:v2`,3600000,adapter.getPairs)).map(pair=>pair.symbol))),
    getCandles: request => marketCache.get(`${id}:candles:${request.symbol}:${request.timeframe}:${request.limit}`, 10000, () => adapter.getCandles(request)),
  };
}
