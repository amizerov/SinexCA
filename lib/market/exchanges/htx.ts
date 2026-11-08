import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { extraPairs, extraTickers, extraCandles } from "./extra-normalize";
const request = exchangeRequest("https://api.huobi.pro");
export const htx = cachedAdapter({
  id: "htx",
  getPairs: async () => extraPairs("htx", await request("/v1/common/symbols"),null),
  getTickers: async symbols => extraTickers("htx", await request("/market/tickers"), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => extraCandles("htx", await request("/market/history/kline", { symbol, period: restInterval("htx",timeframe), size: String(limit) })),
});
