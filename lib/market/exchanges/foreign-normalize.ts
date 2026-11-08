import { z } from "zod";
import { MarketError } from "../errors";
import { normalizeCandles, normalizeTickerBatch } from "../normalize";
import { choosePairs, EXCHANGES } from "../exchange-config";
import type { Candle, ExchangeId, TradingPair } from "../types";

export const record = z.record(z.string(), z.unknown());
const records = z.array(record);
export function unwrap(exchange: ExchangeId, input: unknown): unknown {
  if (exchange === "gate" || exchange === "coinbase") return input;
  const data = record.parse(input);
  if (exchange === "kraken") {
    const errors = z.array(z.string()).parse(data.error);
    if (errors.length) throw new MarketError("UPSTREAM_ERROR", `Kraken: ${errors.join("; ")}`);
    return data.result;
  }
  const code = exchange === "bybit" ? data.retCode : data.code;
  if (![0, "0", "00000"].includes(code as string | number)) throw new MarketError("UPSTREAM_ERROR", `${EXCHANGES[exchange].name}: ${String(data.retMsg || data.msg || "ошибка API")}`);
  return exchange === "bybit" ? record.parse(data.result).list : data.data;
}
export function foreignPairs(exchange: ExchangeId, input: unknown,quoteFilter:string|null=EXCHANGES[exchange].quote): TradingPair[] {
  const data = unwrap(exchange, input);
  const pairs: TradingPair[] = [];
  const add = (symbol: unknown, base: unknown, quote: unknown, active: boolean) => {
    if (active && (quoteFilter===null||quote===quoteFilter)) pairs.push({ exchange, marketType: "spot", symbol: z.string().parse(symbol), baseAsset: z.string().parse(base), quoteAsset: z.string().parse(quote) });
  };
  if (exchange === "kraken") {
    for (const [symbol, value] of Object.entries(record.parse(data))) {
      const r = record.parse(value);
      if (typeof r.wsname !== "string") continue;
      const [base, quote] = r.wsname.split("/");
      add(symbol, base === "XBT" ? "BTC" : base, quote === "XBT" ? "BTC" : quote, r.status === "online");
    }
  } else for (const r of records.parse(data)) {
    switch (exchange) {
      case "bybit": add(r.symbol, r.baseCoin, r.quoteCoin, r.status === "Trading"); break;
      case "okx": add(r.instId, r.baseCcy, r.quoteCcy, r.state === "live"); break;
      case "bitget": add(r.symbol, r.baseCoin, r.quoteCoin, r.status === "online"); break;
      case "gate": add(r.id, r.base, r.quote, r.trade_status === "tradable"); break;
      case "coinbase": add(r.id, r.base_currency, r.quote_currency, r.status === "online" && r.trading_disabled === false); break;
    }
  }
  return choosePairs(pairs);
}
export function foreignTickers(exchange: ExchangeId, input: unknown, symbols: string[], receivedAt = Date.now()) {
  const allowed=new Set(symbols);
  const data = unwrap(exchange, input);
  let rows: Record<string, unknown>[];
  if (exchange === "kraken") rows = Object.entries(record.parse(data)).map(([symbol, value]) => ({ ...record.parse(value), symbol }));
  else rows = records.parse(data);
  const mapped: Record<string, unknown>[] = [];
  for (const r of rows) {
    const symbol = String(r.symbol || r.instId || r.currency_pair);
    if (!allowed.has(symbol)) continue;
    let t: Record<string, unknown>;
    switch (exchange) {
      case "bybit": t = { symbol, lastPrice: r.lastPrice, priceChangePercent: Number(r.price24hPcnt) * 100, quoteVolume: r.turnover24h, volume: r.volume24h, bidPrice: r.bid1Price, askPrice: r.ask1Price, bidQty: r.bid1Size, askQty: r.ask1Size, highPrice: r.highPrice24h, lowPrice: r.lowPrice24h, closeTime: record.parse(input).time }; break;
      case "okx": t = { symbol, lastPrice: r.last, priceChangePercent: change(r.last, r.open24h), quoteVolume: r.volCcy24h, volume: r.vol24h, bidPrice: r.bidPx, askPrice: r.askPx, bidQty: r.bidSz, askQty: r.askSz, highPrice: r.high24h, lowPrice: r.low24h, closeTime: r.ts }; break;
      case "bitget": t = { symbol, lastPrice: r.lastPr, priceChangePercent: Number(r.change24h) * 100, quoteVolume: r.quoteVolume, volume: r.baseVolume, bidPrice: r.bidPr, askPrice: r.askPr, bidQty: r.bidSz, askQty: r.askSz, highPrice: r.high24h, lowPrice: r.low24h, closeTime: r.ts }; break;
      case "gate": t = { symbol, lastPrice: r.last, priceChangePercent: r.change_percentage, quoteVolume: r.quote_volume, volume: r.base_volume, bidPrice: r.highest_bid || "0", askPrice: r.lowest_ask || "0", bidQty: r.highest_size ?? null, askQty: r.lowest_size ?? null, highPrice: r.high_24h, lowPrice: r.low_24h, closeTime: null }; break;
      case "kraken": {
        const array = (key: string) => z.array(z.unknown()).parse(r[key]);
        // Kraken's REST open is UTC midnight, not rolling 24h. Never label that change as rolling 24h.
        t = { symbol, lastPrice: array("c")[0], priceChangePercent: null, quoteVolume: null, volume: array("v")[1], bidPrice: array("b")[0], askPrice: array("a")[0], bidQty: array("b")[2], askQty: array("a")[2], highPrice: array("h")[1], lowPrice: array("l")[1], closeTime: null }; break;
      }
      default: continue;
    }
    mapped.push(t);
  }
  return normalizeTickerBatch(mapped, receivedAt, exchange);
}
export function change(last: unknown, open: unknown) {
  const initial = Number(open), current = Number(last);
  if (!(initial > 0) || !Number.isFinite(current)) throw new Error("Некорректная начальная цена");
  return (current / initial - 1) * 100;
}
export function foreignCandles(exchange: ExchangeId, input: unknown): Candle[] {
  let data = unwrap(exchange, input);
  if (exchange === "kraken") {
    const result = record.parse(data);
    data = Object.entries(result).find(([key]) => key !== "last")?.[1] || [];
  }
  const rows = z.array(z.array(z.unknown())).parse(data);
  return normalizeCandles(rows.map(r => {
    if (exchange === "gate") return [Number(r[0]) * 1000, r[5], r[3], r[4], r[2], r[6]];
    if (exchange === "kraken") return [Number(r[0]) * 1000, r[1], r[2], r[3], r[4], r[6]];
    if (exchange === "coinbase") return [Number(r[0]) * 1000, r[3], r[2], r[1], r[4], r[5]];
    return r;
  }));
}
export function aggregateCandles(candles: Candle[], seconds: number): Candle[] {
  const groups = new Map<number, Candle>();
  for (const candle of [...candles].sort((a,b) => a.time-b.time)) {
    const time = Math.floor(candle.time / seconds) * seconds;
    const old = groups.get(time);
    groups.set(time, old ? { ...old, high: Math.max(old.high, candle.high), low: Math.min(old.low, candle.low), close: candle.close, volume: old.volume + candle.volume } : { ...candle, time });
  }
  return [...groups.values()];
}
