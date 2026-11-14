import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignTickers, foreignCandles } from "./foreign-normalize";
const request = exchangeRequest("https://api.bybit.com");
export const bybit = cachedAdapter({
  id: "bybit",
  getPairs: async () => foreignPairs("bybit", await request("/v5/market/instruments-info", { category: "spot" }),null),
  getTickers: async symbols => foreignTickers("bybit", await request("/v5/market/tickers", { category: "spot" }), symbols),
  getCandles: async ({ symbol, timeframe, limit, endTime }) => foreignCandles("bybit", await request("/v5/market/kline", { category: "spot", symbol, interval: restInterval("bybit",timeframe), limit: String(limit),...endTime!==undefined?{end:String(endTime*1000)}:{} })),
});
