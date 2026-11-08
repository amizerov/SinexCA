import { z } from "zod";
import { rawCandleSchema, rawTickerSchema } from "./schemas";
import type { Candle, ExchangeId, Ticker } from "./types";

export function normalizeCandles(input: unknown): Candle[] {
  const rows = z.array(rawCandleSchema).parse(input);
  const candles = new Map<number, Candle>();
  for (const [milliseconds, open, high, low, close, volume] of rows) {
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      throw new Error("Некорректные OHLC-данные биржи");
    }
    const time = Math.floor(milliseconds / 1000);
    candles.set(time, { time, open, high, low, close, volume });
  }
  return [...candles.values()].sort((a, b) => a.time - b.time);
}
export function normalizeTickers(input: unknown, receivedAt = Date.now(), exchange: ExchangeId = "binance"): Ticker[] {
  return z.array(rawTickerSchema).parse(input).map(t => ({
    exchange, symbol: t.symbol, lastPrice: t.lastPrice,
    priceChangePercent24h: t.priceChangePercent, quoteVolume24h: t.quoteVolume,
    baseVolume24h: t.volume, bid: t.bidPrice, ask: t.askPrice, bidSize: t.bidQty, askSize: t.askQty,
    high24h: t.highPrice, low24h: t.lowPrice, exchangeTime: t.closeTime, receivedAt,
  }));
}
export function mergeCandles(history: Candle[], updates: Candle[], limit = 500): Candle[] {
  const map = new Map(history.map(c => [c.time, c]));
  for (const candle of updates) map.set(candle.time, candle);
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-limit);
}
/** A newly listed market without a first trade must not invalidate the entire market overview. */
export function normalizeTickerBatch(input:unknown,receivedAt=Date.now(),exchange:ExchangeId="binance"):Ticker[]{
  return normalizeTickers(z.array(z.unknown()).parse(input).filter(row=>rawTickerSchema.safeParse(row).success),receivedAt,exchange);
}
