import { test } from "node:test";
import assert from "node:assert/strict";
import { foreignPairs, foreignCandles, foreignTickers, aggregateCandles } from "../lib/market/exchanges/foreign-normalize";
import { decodeForeignStream } from "../lib/market/stream";
import { candleQuery } from "../lib/market/schemas";

test("exchange symbols preserve native delimiters; unknown exchanges and URL injection are rejected", () => {
  for (const [exchange, symbol] of [["bybit", "BTCUSDT"], ["okx", "BTC-USDT"], ["gate", "BTC_USDT"], ["kraken", "XBTUSDT"], ["coinbase", "BTC-USD"]]) assert.equal(candleQuery.safeParse({ exchange, symbol }).success, true);
  assert.equal(candleQuery.safeParse({ exchange: "https://evil.test", symbol: "BTCUSDT" }).success, false);
});
test("pair normalization excludes inactive instruments and derivatives, and retains native Kraken XBT symbol", () => {
  const pairs = foreignPairs("kraken", { error: [], result: {
    XBTUSDT: { wsname: "XBT/USDT", status: "online" },
    ETHUSDT: { wsname: "ETH/USDT", status: "cancel_only" },
    XBTUSD: { wsname: "XBT/USD", status: "online" },
  } });
  assert.deepEqual(pairs, [{ exchange: "kraken", marketType: "spot", symbol: "XBTUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]);
  const okx = foreignPairs("okx", { code: "0", data: [{ instId: "BTC-USDT", baseCcy: "BTC", quoteCcy: "USDT", state: "live" }, { instId: "ETH-USDT", baseCcy: "ETH", quoteCcy: "USDT", state: "suspend" }] });
  assert.equal(okx.length, 1); assert.equal(okx[0].symbol, "BTC-USDT");
  assert.throws(() => foreignPairs("bybit", { retCode: 10006, retMsg: "Rate limit" }));
});
test("Gate uses base volume, Kraken skips VWAP, Coinbase reorders low/high/open", () => {
  const expected = { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 5 };
  assert.deepEqual(foreignCandles("gate", [["60", "12345", "11", "12", "9", "10", "5", "true"]])[0], expected);
  assert.deepEqual(foreignCandles("kraken", { error: [], result: { XBTUSDT: [[60, "10", "12", "9", "11", "10.5", "5", 2]], last: 60 } })[0], expected);
  assert.deepEqual(foreignCandles("coinbase", [[60, 9, 12, 10, 11, 5]])[0], expected);
});
test("Bybit ratios become percentages and exchange timestamps are preserved", () => {
  const [t] = foreignTickers("bybit", { retCode: 0, time: 12345, result: { list: [{ symbol: "BTCUSDT", lastPrice: "11", price24hPcnt: "0.1", turnover24h: "200", volume24h: "18", bid1Price: "10.9", ask1Price: "11", bid1Size: "2", ask1Size: "3", highPrice24h: "12", lowPrice24h: "9" }] } }, ["BTCUSDT"], 13000);
  assert.equal(t.priceChangePercent24h, 10); assert.equal(t.quoteVolume24h, 200); assert.equal(t.exchangeTime, 12345); assert.equal(t.exchange, "bybit");
});
test("stream decoders validate identity, preserve base volume and use UTC candle starts", () => {
  const gate = { channel: "spot.candlesticks", event: "update", result: { t: "60", o: "10", h: "12", l: "9", c: "11", v: "10000", a: "5", n: "1h_BTC_USDT" } };
  assert.equal(decodeForeignStream("gate", gate, { symbol: "BTC_USDT", timeframe: "1h" }).candle?.volume, 5);
  assert.equal(decodeForeignStream("gate", gate, { symbol: "ETH_USDT", timeframe: "1h" }).candle, undefined);
  const kraken = { channel: "ohlc", data: [{ symbol: "BTC/USDT", interval: 60, interval_begin: "2026-11-07T12:00:00.000Z", open: 10, high: 12, low: 9, close: 11, volume: 5 }] };
  assert.equal(decodeForeignStream("kraken", kraken, { symbol: "XBTUSDT", wsSymbol: "BTC/USDT", timeframe: "1h" }).candle?.time, Date.parse("2026-11-07T12:00:00Z") / 1000);
  assert.deepEqual(decodeForeignStream("coinbase", { type: "ticker", product_id: "BTC-USD", price: "10" }, { symbol: "ETH-USD", timeframe: "1m" }), {});
});
test("Coinbase 4h aggregation aligns UTC buckets and combines OHLC and volume", () => {
  const rows = [0, 3600, 7200, 10800, 14400].map((time, i) => ({ time, open: 10 + i, high: 20 + i, low: 5 + i, close: 11 + i, volume: 2 }));
  const grouped = aggregateCandles(rows, 14400);
  assert.deepEqual(grouped[0], { time: 0, open: 10, high: 23, low: 5, close: 14, volume: 8 });
  assert.equal(grouped[1].time, 14400);
});
