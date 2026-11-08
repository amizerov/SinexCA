import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignTickers, foreignCandles } from "./foreign-normalize";
const request = exchangeRequest("https://api.kraken.com");
export const kraken = cachedAdapter({
  id: "kraken",
  getPairs: async () => foreignPairs("kraken", await request("/0/public/AssetPairs"),null),
  getTickers: async symbols => foreignTickers("kraken", await request("/0/public/Ticker", symbols.length>20?{}:{ pair: symbols.join(",") }), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => foreignCandles("kraken", await request("/0/public/OHLC", { pair: symbol, interval: restInterval("kraken",timeframe) })).slice(-limit),
});
