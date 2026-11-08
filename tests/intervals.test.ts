import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCHANGE_IDS } from "../lib/market/exchange-config";
import { exchangeTimeframes,intervalSpec,restInterval,wsInterval,shiftInterval,nearestTimeframe,intervalSeconds } from "../lib/market/intervals";
import { TIMEFRAMES } from "../lib/market/types";
import { candleQuery } from "../lib/market/schemas";
import { streamSettings,decodeForeignStream } from "../lib/market/stream";
test("each exchange exposes its own supported intervals and rejects other exchanges' intervals",()=>{
  for(const exchange of EXCHANGE_IDS){assert.ok(exchangeTimeframes(exchange).includes("1h"));for(const timeframe of exchangeTimeframes(exchange)){assert.ok(restInterval(exchange,timeframe));assert.equal(candleQuery.safeParse({exchange,symbol:"BTCUSDT",timeframe}).success,true);}}
  assert.ok(exchangeTimeframes("binance").includes("1s"));assert.equal(exchangeTimeframes("coinbase").includes("3m"),false);assert.equal(candleQuery.safeParse({exchange:"coinbase",symbol:"BTC-USD",timeframe:"3m"}).success,false);
  assert.equal(restInterval("bybit","1M"),"M");assert.equal(restInterval("gate","1M"),"30d");assert.equal(restInterval("okx","3M"),"3Mutc");assert.equal(restInterval("kraken","15d"),"21600");assert.equal(intervalSpec("bitfinex","4h").computed,true);
});
test("native monthly and weekly websocket subscriptions use exchange codes, not minute approximations",()=>{
  assert.deepEqual(streamSettings("bybit",{symbol:"BTCUSDT",timeframe:"1M"}).message.args,["kline.M.BTCUSDT"]);
  assert.deepEqual(streamSettings("gate",{symbol:"BTC_USDT",timeframe:"1w"}).message.payload,["7d","BTC_USDT"]);
  const event={topic:"kline.M.BTCUSDT",data:[{start:1793491200000,open:"10",high:"12",low:"9",close:"11",volume:"1"}]};assert.equal(decodeForeignStream("bybit",event,{symbol:"BTCUSDT",timeframe:"1M"}).candle?.close,11);
  assert.equal(wsInterval("bitget","3m"),undefined);
});
test("calendar backfill respects variable month lengths and leap years",()=>{
  const stamp=(iso:string)=>Date.parse(iso)/1000;
  assert.equal(shiftInterval(stamp("2024-01-31T00:00:00Z"),"1M",1),stamp("2024-02-29T00:00:00Z"));
  assert.equal(shiftInterval(stamp("2024-02-29T00:00:00Z"),"1y",1),stamp("2025-02-28T00:00:00Z"));
  assert.equal(shiftInterval(stamp("2026-11-01T00:00:00Z"),"3M",-1),stamp("2026-08-01T00:00:00Z"));
});

test("switching exchanges preserves exact intervals or chooses the closest duration",()=>{
  for(const exchange of EXCHANGE_IDS)for(const requested of TIMEFRAMES){
    const actual=nearestTimeframe(exchange,requested),supported=exchangeTimeframes(exchange);
    assert.ok(supported.includes(actual));
    if(supported.includes(requested))assert.equal(actual,requested);
    else assert.equal(Math.abs(intervalSeconds(actual)-intervalSeconds(requested)),Math.min(...supported.map(tf=>Math.abs(intervalSeconds(tf)-intervalSeconds(requested)))));
  }
  assert.equal(nearestTimeframe("bybit","1s"),"1m");
  assert.equal(nearestTimeframe("coinbase","3m"),"5m");
  assert.equal(nearestTimeframe("bybit","3h"),"4h");
  assert.equal(nearestTimeframe("bitfinex","15d"),"14d");
  assert.equal(nearestTimeframe("coinbase","1M"),"1d");
});
