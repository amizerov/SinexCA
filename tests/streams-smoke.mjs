import { subscribeMarketStream } from "../lib/market/stream.ts";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const symbols = { binance: "BTCUSDT", bybit: "BTCUSDT", okx: "BTC-USDT", bitget: "BTCUSDT", gate: "BTC_USDT", kraken: "XBTUSDT", kucoin: "BTC-USDT", bitfinex: "tBTCUST", htx: "btcusdt", mexc:"BTCUSDT", whitebit:"BTC_USDT",cryptocom:"BTC_USDT",bingx:"BTC-USDT" };
const targets = process.argv.length > 2 ? Object.fromEntries(Object.entries(symbols).filter(([id]) => process.argv.slice(2).includes(id))) : symbols;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => nativeFetch(typeof input === "string" && input.startsWith("/") ? new URL(input, process.env.BASE_URL || "http://127.0.0.1:3004") : input, init);
const seconds = { "1m": 60, "15m": 900, "4h": 14400, "1d": 86400 };
const results = await Promise.all(Object.entries(targets).flatMap(([exchange, symbol]) => Object.entries(seconds).map(([timeframe, duration]) => new Promise(resolve => {
  let stop;
  const timer = setTimeout(() => { stop?.(); resolve({ exchange, timeframe, error: "No candle within 40s" }); }, 40000);
  stop = subscribeMarketStream(exchange, { symbol, timeframe, wsSymbol: "BTC/USDT", onStatus() {}, onReconnect() {}, onCandle(candle) {
    clearTimeout(timer); stop();
    try { assert.equal(candle.time % duration, exchange === "htx" && timeframe === "1d" ? 57600 : 0); resolve({ exchange, timeframe, ok: true, time: candle.time }); }
    catch (error) { resolve({ exchange, timeframe, error: error.message }); }
  } });
}))));
await mkdir(".qa", { recursive: true });
await writeFile(Object.keys(targets).length === Object.keys(symbols).length ? ".qa/streams-integration.json" : ".qa/extra-streams-integration.json", JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
for (const result of results) console.log(JSON.stringify(result));
assert.ok(results.every(r => r.ok), "Some stream intervals failed; see .qa/streams-integration.json");
