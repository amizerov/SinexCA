import "server-only";
import { fetchJson } from "@/lib/server/fetch-json";
import { marketCache } from "@/lib/server/cache";
import { exchangeInfoSchema } from "../schemas";
import { normalizeCandles, normalizeTickers,normalizeTickerBatch } from "../normalize";
import type { ExchangeAdapter } from "./adapter";

const BASE = "https://data-api.binance.vision";
const preferred = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TRX", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "NEAR", "UNI", "APT", "TON", "PEPE", "AAVE", "SHIB", "ICP", "ETC", "ATOM", "FIL", "RENDER", "ARB", "OP"].map(s => `${s}USDT`);
function request(path: string, params: Record<string, string> = {}) {
  const url = new URL(`/api/v3/${path}`, BASE);
  url.search = new URLSearchParams(params).toString();
  return fetchJson(url);
}
export const binance: ExchangeAdapter = {
  id: "binance",
  getPairs: () => marketCache.get("binance:catalog:v2", 3_600_000, async () => {
    const result = exchangeInfoSchema.parse(await request("exchangeInfo", { permissions: "SPOT" }));
    const active = result.symbols.filter(p => p.status === "TRADING" && p.isSpotTradingAllowed);
    active.sort((a, b) => {
      const ai = preferred.indexOf(a.symbol), bi = preferred.indexOf(b.symbol);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.symbol.localeCompare(b.symbol);
    });
    return active.map(p => ({ exchange: "binance" as const, marketType: "spot" as const, symbol: p.symbol, baseAsset: p.baseAsset, quoteAsset: p.quoteAsset }));
  }),
  getTickers: symbols => {
    const sorted = [...new Set(symbols)].sort();
    return marketCache.get(`binance:tickers:${sorted.join(",")}`, 5000, async () => normalizeTickers(await request("ticker/24hr", { symbols: JSON.stringify(sorted) })));
  },
  getOverview: () => marketCache.get("binance:overview",15000,async()=>{
    const allowed=new Set((await binance.getPairs()).map(pair=>pair.symbol));
    const data=await request("ticker/24hr");
    return normalizeTickerBatch(Array.isArray(data)?data.filter(row=>allowed.has(row.symbol)):data,Date.now(),"binance");
  }),
  getCandles: ({ symbol, timeframe, limit }) => marketCache.get(`binance:candles:${symbol}:${timeframe}:${limit}`, 10_000,
    async () => normalizeCandles(await request("klines", { symbol, interval: timeframe, limit: String(limit) }))),
};
