import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignTickers, foreignCandles } from "./foreign-normalize";
import { mergeCandles } from "../normalize";
import type { Candle } from "../types";
const request = exchangeRequest("https://api.bitget.com");
export const bitget = cachedAdapter({
  id: "bitget",
  getPairs: async () => foreignPairs("bitget", await request("/api/v2/spot/public/symbols"),null),
  getTickers: async symbols => foreignTickers("bitget", await request("/api/v2/spot/market/tickers"), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => {
    const granularity = restInterval("bitget",timeframe);
    let candles: Candle[] = [], endTime = String(Date.now());
    for (let page = 0; page < Math.ceil(limit / 100) + 2 && candles.length < limit; page++) {
      const batch = foreignCandles("bitget", await request("/api/v2/spot/market/history-candles", { symbol, granularity, endTime, limit: String(Math.min(200, limit - candles.length)) }));
      if (!batch.length) break;
      const next = String(batch[0].time * 1000 - 1); if (next === endTime) break;
      candles = mergeCandles(candles, batch, limit + 300); endTime = next;
    }
    // Historical endpoint excludes the in-progress candle.
    return mergeCandles(candles, foreignCandles("bitget", await request("/api/v2/spot/market/candles", { symbol, granularity, limit: "2" })), limit);
  },
});
