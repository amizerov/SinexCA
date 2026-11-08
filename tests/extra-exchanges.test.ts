import { test } from "node:test";
import assert from "node:assert/strict";
import { extraPairs, extraCandles, extraTickers } from "../lib/market/exchanges/extra-normalize";
import { createExtraDecoder } from "../lib/market/extra-streams";
import { decodeMexcKline, protobufFields } from "../lib/market/mexc-protobuf";
import { candleQuery } from "../lib/market/schemas";

test("extra exchanges retain native symbols and exclude disabled instruments", () => {
  assert.equal(candleQuery.safeParse({ exchange: "bitfinex", symbol: "tLINK:UST" }).success, true);
  assert.equal(candleQuery.safeParse({ exchange: "htx", symbol: "btcusdt" }).success, true);
  assert.deepEqual(extraPairs("bitfinex", [["BTCUST", "ETHUSD", "LINK:UST", "TESTBTC:TESTUSDT"]]).map(p => [p.symbol,p.baseAsset,p.quoteAsset]), [["tBTCUST","BTC","USDT"],["tLINK:UST","LINK","USDT"]]);
  assert.equal(extraPairs("kucoin", { code: "200000", data: [{ symbol: "BTC-USDT", baseCurrency: "BTC", quoteCurrency: "USDT", enableTrading: true }, { symbol: "ETH-USDT", baseCurrency: "ETH", quoteCurrency: "USDT", enableTrading: false }] }).length, 1);
  assert.equal(extraPairs("htx", { status: "ok", data: [{ symbol: "btcusdt", "base-currency": "btc", "quote-currency": "usdt", state: "online" }] })[0].baseAsset, "BTC");
});
test("KuCoin and Bitfinex reorder OCHL correctly; HTX uses amount as base volume", () => {
  const expected = { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 5 };
  assert.deepEqual(extraCandles("kucoin", { code: "200000", data: [["60","10","11","12","9","5","999"]] })[0], expected);
  assert.deepEqual(extraCandles("bitfinex", [[60000,10,11,12,9,5]])[0], expected);
  assert.deepEqual(extraCandles("htx", { status: "ok", data: [{ id: 60, open: 10, high: 12, low: 9, close: 11, amount: 5, vol: 999 }] })[0], expected);
});
test("MEXC ratios are not misrepresented as percentages", () => {
  const [ticker] = extraTickers("mexc", [{ symbol: "BTCUSDT", lastPrice: "99", openPrice: "100", priceChangePercent: "-0.01", quoteVolume: "1000", volume: "10", bidPrice: "99", askPrice: "99.1", highPrice: "101", lowPrice: "98" }], ["BTCUSDT"]);
  assert.ok(Math.abs(ticker.priceChangePercent24h! + 1) < 1e-10);
  assert.equal(ticker.bidSize, null);
});
test("Bitfinex stream keeps channel identity and aggregates 4h using hourly snapshots and updates", () => {
  const decode = createExtraDecoder("bitfinex", { symbol: "tBTCUST", timeframe: "4h", onCandle() {}, onReconnect() {}, onStatus() {} });
  decode({ event: "subscribed", channel: "candles", chanId: 7, key: "trade:1h:tBTCUST" });
  assert.equal(decode([8, [0,10,11,12,9,5]]), undefined);
  const snapshot = decode([7, [[0,10,11,12,9,5],[3600000,11,12,13,10,6]]]);
  assert.equal(snapshot?.volume, 11);
  const update = decode([7,[3600000,11,13,14,10,8]]);
  assert.equal(update?.volume, 13); assert.equal(update?.close, 13);
});
function varint(value: number) { const result: number[] = []; do { const byte = value % 128; value = Math.floor(value / 128); result.push(byte | (value ? 128 : 0)); } while(value); return result; }
function field(id: number, value: string | Uint8Array | number): number[] {
  if (typeof value === "number") return [...varint(id*8),...varint(value)];
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...varint(id*8+2),...varint(bytes.length),...bytes];
}
test("MEXC protobuf decodes official kline fields and rejects malformed or unrelated frames", () => {
  const payload = new Uint8Array([ ...field(1,"Min60"),...field(2,3600),...field(3,"10"),...field(4,"11"),...field(5,"12"),...field(6,"9"),...field(7,"5") ]);
  const wrapper = new Uint8Array([...field(1,"spot@public.kline.v3.api.pb@BTCUSDT@Min60"),...field(3,"BTCUSDT"),...field(308,payload)]);
  assert.deepEqual(decodeMexcKline(wrapper,"BTCUSDT","1h"), { time: 3600, open: 10, high: 12, low: 9, close: 11, volume: 5 });
  assert.equal(decodeMexcKline(wrapper,"ETHUSDT","1h"), undefined);
  assert.equal(decodeMexcKline(wrapper,"BTCUSDT","1m"), undefined);
  assert.throws(() => protobufFields(new Uint8Array([10,100,1])));
  assert.throws(() => protobufFields(new Uint8Array([128])));
});
