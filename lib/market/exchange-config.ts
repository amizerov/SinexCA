import type { ExchangeId, TradingPair } from "./types";
export const EXCHANGE_IDS = ["binance", "bybit", "okx", "bitget", "gate", "kraken", "coinbase", "kucoin", "bitfinex", "htx", "mexc", "whitebit", "cryptocom"] as const;
export const EXCHANGES: Record<ExchangeId, { name: string; quote: string; candleStream: boolean; docs: string }> = {
  binance: { name: "Binance", quote: "USDT", candleStream: true, docs: "https://developers.binance.com/docs/binance-spot-api-docs" },
  bybit: { name: "Bybit", quote: "USDT", candleStream: true, docs: "https://bybit-exchange.github.io/docs/v5/intro" },
  okx: { name: "OKX", quote: "USDT", candleStream: true, docs: "https://www.okx.com/docs-v5/en/" },
  bitget: { name: "Bitget", quote: "USDT", candleStream: true, docs: "https://www.bitget.com/docs/classic/rest-api" },
  gate: { name: "Gate", quote: "USDT", candleStream: true, docs: "https://www.gate.com/docs/developers/apiv4/" },
  kraken: { name: "Kraken", quote: "USDT", candleStream: true, docs: "https://docs.kraken.com/api/" },
  coinbase: { name: "Coinbase", quote: "USD", candleStream: false, docs: "https://docs.cdp.coinbase.com/exchange/introduction/welcome" },
  kucoin: { name: "KuCoin", quote: "USDT", candleStream: true, docs: "https://www.kucoin.com/docs-new" },
  bitfinex: { name: "Bitfinex", quote: "USDT", candleStream: true, docs: "https://docs.bitfinex.com/reference/rest-public-tickers" },
  htx: { name: "HTX", quote: "USDT", candleStream: true, docs: "https://huobiapi.github.io/docs/spot/v1/en/" },
  mexc: { name: "MEXC", quote: "USDT", candleStream: true, docs: "https://www.mexc.com/api-docs/spot-v3/introduction" },
  whitebit: { name: "WhiteBIT", quote: "USDT", candleStream: true, docs: "https://docs.whitebit.com/" },
  cryptocom: { name: "Crypto.com", quote: "USDT", candleStream: true, docs: "https://exchange-developer.crypto.com/exchange/v1/" },
};
export const PREFERRED_ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TRX", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "NEAR", "UNI", "APT", "TON", "PEPE", "AAVE", "SHIB", "ICP", "ETC", "ATOM", "FIL", "RENDER", "ARB", "OP"];
export function choosePairs(pairs: TradingPair[]): TradingPair[] {
  return pairs.sort((a, b) => {
    const ai = PREFERRED_ASSETS.indexOf(a.baseAsset), bi = PREFERRED_ASSETS.indexOf(b.baseAsset);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.baseAsset.localeCompare(b.baseAsset);
  });
}
export function tradingUrl(exchange: ExchangeId, pair?: TradingPair) {
  const base = pair?.baseAsset || "BTC", quote = pair?.quoteAsset || EXCHANGES[exchange].quote;
  switch (exchange) {
    case "binance": return `https://www.binance.com/en/trade/${base}_${quote}?type=spot`;
    case "bybit": return `https://www.bybit.com/en/trade/spot/${base}/${quote}`;
    case "okx": return `https://www.okx.com/trade-spot/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case "bitget": return `https://www.bitget.com/spot/${base}${quote}`;
    case "gate": return `https://www.gate.com/trade/${base}_${quote}`;
    case "kraken": return `https://pro.kraken.com/app/trade/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case "coinbase": return `https://www.coinbase.com/advanced-trade/spot/${base}-${quote}`;
    case "kucoin": return `https://www.kucoin.com/trade/${base}-${quote}`;
    case "bitfinex": return `https://trading.bitfinex.com/t/${(pair?.symbol || "tBTCUST").slice(1)}`;
    case "htx": return `https://www.htx.com/trade/${base.toLowerCase()}_${quote.toLowerCase()}`;
    case "mexc": return `https://www.mexc.com/exchange/${base}_${quote}`;
    case "whitebit": return `https://whitebit.com/trade/${base}_${quote}`;
    case "cryptocom": return `https://crypto.com/exchange/trade/${base}_${quote}`;
  }
}
