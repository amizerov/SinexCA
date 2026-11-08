import { restInterval,shiftInterval } from "../intervals";
import "server-only";
import { z } from "zod";
import { marketCache } from "@/lib/server/cache";
import { MarketError } from "../errors";
import { cachedAdapter, exchangeRequest } from "./shared";
import { extraPairs, extraTickers, extraCandles, extraData } from "./extra-normalize";
const request = exchangeRequest("https://api.kucoin.com");
export const kucoin = cachedAdapter({
  id: "kucoin",
  getPairs: async () => extraPairs("kucoin", await request("/api/v2/symbols"),null),
  getTickers: async symbols => extraTickers("kucoin", await request("/api/v1/market/allTickers"), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => {
    const endAt = Math.floor(Date.now() / 1000);
    return extraCandles("kucoin", await request("/api/v1/market/candles", { symbol, type: restInterval("kucoin",timeframe), startAt: String(shiftInterval(endAt,timeframe,-limit-1)), endAt: String(endAt) })).slice(-limit);
  },
});
export function getKucoinToken() {
  return marketCache.get("kucoin:public-token", 300000, async () => {
    const data = z.object({ token: z.string().min(1), instanceServers: z.array(z.object({ endpoint: z.string().url(), pingInterval: z.number().positive() })).min(1) }).parse(extraData("kucoin", await request("/api/v1/bullet-public", {}, "POST")));
    const server = data.instanceServers[0], url = new URL(server.endpoint);
    if (url.protocol !== "wss:" || url.hostname !== "ws-api-spot.kucoin.com") throw new MarketError("UPSTREAM_ERROR", "KuCoin вернул неизвестный адрес потока.");
    return { token: data.token, endpoint: server.endpoint, pingInterval: server.pingInterval };
  });
}
