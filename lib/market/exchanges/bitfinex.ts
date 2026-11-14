import { restInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { extraPairs, extraTickers, extraCandles } from "./extra-normalize";
import { aggregateCandles } from "./foreign-normalize";
const request = exchangeRequest("https://api-pub.bitfinex.com");
export const bitfinex = cachedAdapter({
  id: "bitfinex",
  getPairs: async () => extraPairs("bitfinex", await request("/v2/conf/pub:list:pair:exchange"),null),
  getTickers: async symbols => extraTickers("bitfinex", await request("/v2/tickers", { symbols: symbols.length>20?"ALL":symbols.join(",") }), symbols),
  getCandles: async ({ symbol, timeframe, limit, endTime }) => {
    const interval = restInterval("bitfinex",timeframe);
    const candles = extraCandles("bitfinex", await request(`/v2/candles/trade:${interval}:${symbol}/hist`, { limit: String(timeframe === "4h" ? limit * 4 + 4 : limit), sort: "-1",...endTime!==undefined?{end:String(endTime*1000)}:{} }));
    return (timeframe === "4h" ? aggregateCandles(candles, 14400) : candles).slice(-limit);
  },
});
