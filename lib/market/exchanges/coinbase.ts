import { restInterval } from "../intervals";
import "server-only";
import { marketCache } from "@/lib/server/cache";
import { MarketError } from "../errors";
import { cachedAdapter, exchangeRequest } from "./shared";
import { foreignPairs, foreignCandles, record, change, aggregateCandles } from "./foreign-normalize";
import { mergeCandles, normalizeTickers,normalizeTickerBatch } from "../normalize";
import type { Candle } from "../types";
const fetch = exchangeRequest("https://api.exchange.coinbase.com");
let nextRequest = 0;
async function request(path: string, params: Record<string, string> = {}) {
  const now = Date.now(), delay = Math.max(0, nextRequest - now);
  if (delay > 8000) throw new MarketError("BUSY", "Coinbase обрабатывает очередь запросов. Повторите позже.", 502);
  nextRequest = Math.max(now, nextRequest) + 150;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  return fetch(path, params);
}
export const coinbase = cachedAdapter({
  id: "coinbase",
  getPairs: async () => foreignPairs("coinbase", await request("/products"),null),
  getOverview: async () => {
    const stats=record.parse(await marketCache.get("coinbase:stats",15000,()=>request("/products/stats")));
    return normalizeTickerBatch(Object.entries(stats).map(([symbol,value])=>{
      const day=record.parse(record.parse(value).stats_24hour);
      return {symbol,lastPrice:day.last,priceChangePercent:change(day.last,day.open),quoteVolume:null,volume:day.volume,bidPrice:null,askPrice:null,bidQty:null,askQty:null,highPrice:day.high,lowPrice:day.low,closeTime:null};
    }),Date.now(),"coinbase");
  },
  getTickers: async symbols => {
    const stats = await marketCache.get("coinbase:stats", 15000, async () => record.parse(await request("/products/stats")));
    const rows = await Promise.all(symbols.map(symbol => marketCache.get(`coinbase:ticker:${symbol}`, 10000, async () => {
      const ticker = record.parse(await request(`/products/${symbol}/ticker`));
      const day = record.parse(record.parse(stats[symbol]).stats_24hour);
      return { symbol, lastPrice: ticker.price, priceChangePercent: change(ticker.price, day.open), quoteVolume: null, volume: day.volume, bidPrice: ticker.bid, askPrice: ticker.ask, bidQty: null, askQty: null, highPrice: day.high, lowPrice: day.low, closeTime: Date.parse(String(ticker.time)) };
    })));
    return normalizeTickers(rows, Date.now(), "coinbase");
  },
  getCandles: async ({ symbol, timeframe, limit }) => {
    const seconds = Number(restInterval("coinbase",timeframe));
    const needed = timeframe === "4h" ? limit * 4 + 3 : limit;
    let end = Math.floor(Date.now() / 1000 / seconds) * seconds + seconds;
    let candles: Candle[] = [];
    for (let page = 0; page < Math.ceil(needed / 299) + 1 && candles.length < needed; page++) {
      const start = end - Math.min(299, needed - candles.length + 1) * seconds;
      const batch = foreignCandles("coinbase", await request(`/products/${symbol}/candles`, { granularity: String(seconds), start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString() }));
      if (!batch.length) break;
      candles = mergeCandles(candles, batch, needed + 300); end = batch[0].time - 1;
    }
    return (timeframe === "4h" ? aggregateCandles(candles, 14400) : candles).slice(-limit);
  },
}, 10000);
