import { z } from "zod";
import { choosePairs } from "../exchange-config";
import { normalizeCandles, normalizeTickerBatch } from "../normalize";
import { MarketError } from "../errors";
import { change, record } from "./foreign-normalize";
import type { ExchangeId, TradingPair } from "../types";
export type ExtraId = Extract<ExchangeId, "kucoin" | "bitfinex" | "htx" | "mexc">;
export function extraData(id: ExtraId, input: unknown) {
  if (id === "bitfinex" || id === "mexc") return input;
  const result = record.parse(input);
  if ((id === "kucoin" && result.code !== "200000") || (id === "htx" && result.status !== "ok")) throw new MarketError("UPSTREAM_ERROR", `${id.toUpperCase()}: ${String(result.msg || result["err-msg"] || "ошибка API")}`);
  return result.data;
}
export function extraPairs(id: ExtraId, input: unknown,quoteFilter:string|null="USDT"): TradingPair[] {
  const pairs: TradingPair[] = [];
  const add = (symbol: string, base: string, quote: string) => { if (quoteFilter===null||quote===quoteFilter) pairs.push({ exchange: id, marketType: "spot", symbol, baseAsset: base, quoteAsset: quote }); };
  if (id === "bitfinex") {
    const symbols = z.array(z.array(z.string())).parse(input)[0];
    for (const symbol of symbols) {
      if (symbol.includes("TEST")) continue;
      const [base,quote]=symbol.includes(":")?symbol.split(":"):[symbol.slice(0,-3),symbol.slice(-3)];
      const asset=(value:string)=>value==="UST"?"USDT":value==="UDC"?"USDC":value;
      if(base&&quote)add(`t${symbol}`,asset(base),asset(quote));
    }
  } else if (id === "mexc") {
    for (const row of z.array(record).parse(record.parse(input).symbols)) if (row.status === "1" && row.isSpotTradingAllowed === true) add(String(row.symbol), String(row.baseAsset), String(row.quoteAsset));
  } else for (const row of z.array(record).parse(extraData(id, input))) {
    if (id === "kucoin" && row.enableTrading === true) add(String(row.symbol), String(row.baseCurrency), String(row.quoteCurrency));
    if (id === "htx" && row.state === "online" && row["api-trading"] !== "disabled") add(String(row.symbol), String(row["base-currency"]).toUpperCase(), String(row["quote-currency"]).toUpperCase());
  }
  return choosePairs(pairs);
}
export function extraTickers(id: ExtraId, input: unknown, symbols: string[], receivedAt = Date.now()) {
  const allowed=new Set(symbols);
  if (id === "bitfinex") {
    const rows = z.array(z.array(z.unknown())).parse(input).filter(r => allowed.has(String(r[0])));
    return normalizeTickerBatch(rows.map(r => ({ symbol: r[0], bidPrice: r[1], bidQty: r[2], askPrice: r[3], askQty: r[4], priceChangePercent: Number(r[6]) * 100, lastPrice: r[7], volume: r[8], quoteVolume: null, highPrice: r[9], lowPrice: r[10], closeTime: null })), receivedAt, id);
  }
  if (id === "mexc") {
    const rows = z.array(record).parse(input).filter(r => allowed.has(String(r.symbol)));
    return normalizeTickerBatch(rows.map(r => ({ ...r, priceChangePercent: change(r.lastPrice, r.openPrice), bidQty: r.bidQty ?? null, askQty: r.askQty ?? null, closeTime: r.closeTime ?? null })), receivedAt, id);
  }
  const data = extraData(id, input);
  const envelope = record.parse(input);
  const rows = z.array(record).parse(id === "kucoin" ? record.parse(data).ticker : data).filter(r => allowed.has(String(r.symbol)));
  return normalizeTickerBatch(rows.map(r => id === "kucoin"
    ? { symbol: r.symbol, lastPrice: r.last, priceChangePercent: Number(r.changeRate) * 100, volume: r.vol, quoteVolume: r.volValue, bidPrice: r.buy || "0", askPrice: r.sell || "0", bidQty: r.bestBidSize ?? null, askQty: r.bestAskSize ?? null, highPrice: r.high, lowPrice: r.low, closeTime: record.parse(data).time }
    : { symbol: r.symbol, lastPrice: r.close, priceChangePercent: change(r.close, r.open), volume: r.amount, quoteVolume: r.vol, bidPrice: r.bid ?? 0, askPrice: r.ask ?? 0, bidQty: r.bidSize ?? null, askQty: r.askSize ?? null, highPrice: r.high, lowPrice: r.low, closeTime: envelope.ts ?? null }), receivedAt, id);
}
export function extraCandles(id: ExtraId, input: unknown) {
  const data = extraData(id, input);
  if (id === "htx") return normalizeCandles(z.array(record).parse(data).map(r => [Number(r.id) * 1000, r.open, r.high, r.low, r.close, r.amount]));
  const rows = z.array(z.array(z.unknown())).parse(data);
  if (id === "kucoin") return normalizeCandles(rows.map(r => [Number(r[0]) * 1000, r[1], r[3], r[4], r[2], r[5]]));
  if (id === "bitfinex") return normalizeCandles(rows.map(r => [r[0], r[1], r[3], r[4], r[2], r[5]]));
  return normalizeCandles(rows);
}
