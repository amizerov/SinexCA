export type ExchangeId = "binance" | "bybit" | "okx" | "bitget" | "gate" | "kraken" | "coinbase" | "kucoin" | "bitfinex" | "htx" | "mexc" | "whitebit" | "cryptocom";
export type MarketType = "spot";
export const TIMEFRAMES = ["1s","10s","30s","1m","3m","5m","15m","30m","1h","2h","3h","4h","6h","8h","12h","1d","2d","3d","1w","14d","15d","1M","3M","1y"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export interface TradingPair {
  exchange: ExchangeId; marketType: MarketType; symbol: string; baseAsset: string; quoteAsset: string;
}
export interface Ticker {
  exchange: ExchangeId; symbol: string; lastPrice: number; priceChangePercent24h: number | null;
  quoteVolume24h: number | null; baseVolume24h?: number; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null;
  high24h: number; low24h: number; exchangeTime: number | null; receivedAt: number;
}
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface MarketResponse<T> {
  data: T; meta: { exchange: ExchangeId; marketType: MarketType; fetchedAt: string };
}
export type StreamStatus = "connecting" | "live" | "stale" | "reconnecting" | "offline";
