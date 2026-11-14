import { restInterval,intervalSeconds } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignTickers, foreignCandles } from "./foreign-normalize";
const request = exchangeRequest("https://api.gateio.ws");
export const gate = cachedAdapter({
  id: "gate",
  getPairs: async () => foreignPairs("gate", await request("/api/v4/spot/currency_pairs"),null),
  getTickers: async symbols => foreignTickers("gate", await request("/api/v4/spot/tickers"), symbols),
  getCandles: async ({ symbol, timeframe, limit, endTime }) => foreignCandles("gate", await request("/api/v4/spot/candlesticks", { currency_pair: symbol, interval: restInterval("gate",timeframe), ...endTime===undefined?{limit:String(limit)}:{from:String(endTime-intervalSeconds(timeframe)*limit+1),to:String(endTime)} })),
});
