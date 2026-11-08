import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCandles, mergeCandles, normalizeTickers } from "../lib/market/normalize";
import { candleQuery, tickerQuery, exchangeInfoSchema } from "../lib/market/schemas";
import { decodeKline } from "../lib/market/stream";
import { TtlCache } from "../lib/server/cache";
import { getMarket, ApiError } from "../lib/market/client";

const row = (time: number, close = "11") => [time, "10", "12", "9", close, "5.5", time + 59999];
test("client translates browser fetch failures into a readable connection error", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(getMarket("/api/market/candles", new AbortController().signal), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "CONNECTION_ERROR");
    assert.match(error.message, /Не удалось загрузить данные с сервера/);
    return true;
  });
});
test("client rejects malformed responses and preserves request cancellation", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Unavailable</html>"));
  await assert.rejects(getMarket("/api/market/pairs", new AbortController().signal), error => error instanceof ApiError && error.code === "INVALID_RESPONSE");
  const controller = new AbortController(); controller.abort();
  const cancellation = new DOMException("Aborted", "AbortError");
  t.mock.method(globalThis, "fetch", async () => { throw cancellation; });
  await assert.rejects(getMarket("/api/market/pairs", controller.signal), error => error === cancellation);
});
test("candles: converts milliseconds and numeric strings, sorts, keeps last duplicate", () => {
  const data = normalizeCandles([row(180000), row(60000), row(180000, "12")]);
  assert.equal(data.length, 2);
  assert.deepEqual(data[0], { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 5.5 });
  assert.equal(data[1].close, 12);
});
test("candles: rejects non-finite values, negative volume and invalid OHLC", () => {
  assert.throws(() => normalizeCandles([[60000, "NaN", "12", "9", "11", "5"]]));
  assert.throws(() => normalizeCandles([[60000, "10", "12", "9", "Infinity", "5"]]));
  assert.throws(() => normalizeCandles([[60000, "10", "12", "9", "11", "-5"]]));
  assert.throws(() => normalizeCandles([row(60000, "20")]));
});
test("query: defaults, valid intervals and strict parameter boundaries", () => {
  assert.deepEqual(candleQuery.parse({ symbol: "BTCUSDT" }), { exchange: "binance", symbol: "BTCUSDT", timeframe: "1h", limit: 500 });
  for (const limit of [0, 1001, 1.5, "NaN", ""]) assert.equal(candleQuery.safeParse({ symbol: "BTCUSDT", limit }).success, false);
  for (const symbol of ["../../secret", "https://example.com"]) assert.equal(candleQuery.safeParse({ symbol }).success, false);
  assert.equal(candleQuery.safeParse({ symbol: "BTCUSDT", timeframe: "5m" }).success, true);
  assert.equal(candleQuery.safeParse({ symbol: "BTCUSDT", timeframe: "10m" }).success, false);
  assert.equal(candleQuery.safeParse({ symbol: "BTCUSDT", exchange: "unknown" }).success, false);
  assert.equal(tickerQuery.safeParse({ symbols: Array(21).fill("BTCUSDT").join(",") }).success, false);
  assert.deepEqual(tickerQuery.parse({ symbols: "BTCUSDT,ETHUSDT,BTCUSDT" }).symbols, ["BTCUSDT", "ETHUSDT"]);
});
test("realtime merge: stream wins over REST for same candle, history fills gaps, size bounded", () => {
  const history = normalizeCandles([row(60000), row(120000)]);
  const stream = normalizeCandles([row(120000, "12"), row(180000)]);
  const merged = mergeCandles(history, stream, 2);
  assert.deepEqual(merged.map(c => c.time), [120, 180]);
  assert.equal(merged[0].close, 12);
});
test("stream decoder: ignores old symbols, different intervals and corrupt data", () => {
  const event = { e: "kline", s: "BTCUSDT", k: { t: 60000, i: "1m", o: "10", h: "12", l: "9", c: "11", v: "2" } };
  assert.equal(decodeKline(event, "BTCUSDT", "1m")?.time, 60);
  assert.equal(decodeKline(event, "ETHUSDT", "1m"), null);
  assert.equal(decodeKline(event, "BTCUSDT", "1h"), null);
  assert.equal(decodeKline({ ...event, k: { ...event.k, c: "Infinity" } }, "BTCUSDT", "1m"), null);
});
test("ticker normalization preserves quote volume, bid/ask and both timestamps", () => {
  const [ticker] = normalizeTickers([{ symbol: "BTCUSDT", lastPrice: "10", priceChangePercent: "-1.5", quoteVolume: "1000", bidPrice: "9.9", askPrice: "10.1", bidQty: "2", askQty: "3", highPrice: "12", lowPrice: "9", closeTime: 123456 }], 123500);
  assert.equal(ticker.priceChangePercent24h, -1.5);
  assert.equal(ticker.quoteVolume24h, 1000);
  assert.equal(ticker.bidSize, 2);
  assert.equal(ticker.exchangeTime, 123456);
  assert.equal(ticker.receivedAt, 123500);
});
test("exchange info uses explicit spot flag even when permissions array is empty", () => {
  const result = exchangeInfoSchema.parse({ symbols: [{ symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", isSpotTradingAllowed: true, permissions: [], permissionSets: [["SPOT"]] }] });
  assert.equal(result.symbols[0].isSpotTradingAllowed, true);
});
test("cache: combines concurrent requests, expires entries and never caches failures", async () => {
  const cache = new TtlCache(2);
  let calls = 0;
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return calls; };
  assert.deepEqual(await Promise.all([cache.get("a", 10, load), cache.get("a", 10, load)]), [1, 1]);
  assert.equal(await cache.get("a", 10, load), 1);
  await new Promise(r => setTimeout(r, 15));
  assert.equal(await cache.get("a", 1000, load), 2);
  await assert.rejects(cache.get("bad", 1000, async () => { throw new Error("network"); }));
  assert.equal(await cache.get("bad", 1000, async () => 42), 42);
});
test("cache: evicts least recently used entries at capacity", async () => {
  const cache = new TtlCache(2);
  await cache.get("a", 1000, async () => 1);
  await cache.get("b", 1000, async () => 2);
  await cache.get("a", 1000, async () => 99);
  await cache.get("c", 1000, async () => 3);
  assert.equal(await cache.get("b", 1000, async () => 20), 20);
});
