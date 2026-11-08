import type { Ticker, TradingPair } from "./types";
export type PairSort = "volume" | "change" | "name";
function descendingKnown(first: number | null | undefined, second: number | null | undefined) {
  if (first == null) return second == null ? 0 : 1;
  if (second == null) return -1;
  return second - first;
}
export function sortPairs(pairs: TradingPair[], tickers: Map<string, Ticker>, sort: PairSort) {
  return [...pairs].sort((a, b) => {
    const first = tickers.get(a.symbol), second = tickers.get(b.symbol);
    const result = sort === "volume" ? descendingKnown(first?.quoteVolume24h, second?.quoteVolume24h)
      : sort === "change" ? descendingKnown(first?.priceChangePercent24h, second?.priceChangePercent24h) : 0;
    return result || a.baseAsset.localeCompare(b.baseAsset);
  });
}
