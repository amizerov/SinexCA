import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignTickers, foreignCandles } from "./foreign-normalize";
import { mergeCandles } from "../normalize";
import type { Candle } from "../types";
const request = exchangeRequest("https://www.okx.com");
export const okx = cachedAdapter({
  id: "okx",
  getPairs: async () => foreignPairs("okx", await request("/api/v5/public/instruments", { instType: "SPOT" }),null),
  getTickers: async symbols => foreignTickers("okx", await request("/api/v5/market/tickers", { instType: "SPOT" }), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => {
    const bar = restInterval("okx",timeframe);
    let candles: Candle[] = [], after: string | undefined;
    for (let page = 0; page < Math.ceil(limit / 100) + 2 && candles.length < limit; page++) {
      const batch = foreignCandles("okx", await request("/api/v5/market/history-candles", { instId: symbol, bar, limit: String(Math.min(300, limit - candles.length)), ...(after ? { after } : {}) }));
      if (!batch.length) break;
      const next = String(batch[0].time * 1000); if (next === after) break;
      candles = mergeCandles(candles, batch, limit + 300); after = next;
    }
    return candles.slice(-limit);
  },
});
