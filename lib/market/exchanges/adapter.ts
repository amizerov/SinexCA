import type { Candle, ExchangeId, Ticker, Timeframe, TradingPair } from "../types";
export interface ExchangeAdapter {
  readonly id: ExchangeId;
  getPairs(): Promise<TradingPair[]>;
  getTickers(symbols: string[]): Promise<Ticker[]>;
  getOverview?(): Promise<Ticker[]>;
  getCandles(params: { symbol: string; timeframe: Timeframe; limit: number; endTime?: number }): Promise<Candle[]>;
}
