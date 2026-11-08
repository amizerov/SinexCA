import { z } from "zod";
import { TIMEFRAMES } from "./types";
import { EXCHANGE_IDS } from "./exchange-config";
import { EXCHANGE_INTERVALS } from "./intervals";

export const symbolSchema = z.string().max(40).regex(/^[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*$/, "Некорректное обозначение торговой пары");
export const exchangeQuery = z.object({ exchange: z.enum(EXCHANGE_IDS).default("binance") });
export const marketListQuery=exchangeQuery.extend({quote:z.string().max(30).regex(/^(all|[A-Z0-9]+)$/).optional()});
export const candleQuery = exchangeQuery.extend({
  symbol: symbolSchema,
  timeframe: z.enum(TIMEFRAMES).default("1h"),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
}).refine(query=>!!EXCHANGE_INTERVALS[query.exchange][query.timeframe],{message:"Этот интервал недоступен на выбранной бирже.",path:["timeframe"]});
export const tickerQuery = exchangeQuery.extend({
  symbols: z.string().max(850).transform(s => s.split(",")).pipe(z.array(symbolSchema).min(1).max(20)).transform(s => [...new Set(s)]),
});
export const finiteNumber = z.union([z.number(), z.string().min(1)]).transform(Number).pipe(z.number().finite());
const nonnegative = finiteNumber.pipe(z.number().nonnegative());
const positive = finiteNumber.pipe(z.number().positive());
export const rawCandleSchema = z.tuple([
  nonnegative, positive, positive, positive, positive, nonnegative,
]).rest(z.unknown());
export const rawTickerSchema = z.object({
  symbol: z.string(), lastPrice: positive, priceChangePercent: finiteNumber.nullable(),
  quoteVolume: nonnegative.nullable(), volume: nonnegative.optional(), bidPrice: nonnegative.nullable(), askPrice: nonnegative.nullable(),
  bidQty: nonnegative.nullable(), askQty: nonnegative.nullable(), highPrice: positive, lowPrice: positive,
  closeTime: nonnegative.nullable(),
});
export const exchangeInfoSchema = z.object({ symbols: z.array(z.object({
  symbol: z.string(), status: z.string(), baseAsset: z.string(), quoteAsset: z.string(),
  isSpotTradingAllowed: z.boolean(),
})) });
