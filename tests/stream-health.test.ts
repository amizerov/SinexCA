import { test } from "node:test";
import assert from "node:assert/strict";
import { StreamHealth,streamFreshnessMs } from "../lib/market/stream-health";
import { sortPairs } from "../lib/market/sort-pairs";
import type { TradingPair,Ticker } from "../lib/market/types";
test("heartbeat and subscription ack do not mark market data fresh; REST cannot refresh stream health",()=>{
  const health=new StreamHealth("okx");health.open(1000);health.acknowledge();health.transport(2000);assert.equal(health.fresh(2000),false);
  health.market(3000);assert.equal(health.fresh(3000),true);
  health.transport(60000);assert.equal(health.connected,true);assert.equal(health.fresh(60000),false);
  health.market(61000);assert.equal(health.fresh(61000),true);health.close();assert.equal(health.fresh(61000),false);
});
test("Bybit permits its 60-second event cadence while other stale streams fall back",()=>{
  const health=new StreamHealth("bybit");health.open(1000);health.market(1000);assert.equal(health.fresh(61000),true);assert.equal(health.fresh(77000),false);
  assert.equal(streamFreshnessMs("kraken"),120000);
});
test("unknown metrics sort last, retaining real zero and negative price changes",()=>{
  const pairs=["UNKNOWN","ZERO","NEGATIVE","POSITIVE"].map(baseAsset=>({symbol:baseAsset,baseAsset})) as TradingPair[];
  const tickers=new Map([["ZERO",{priceChangePercent24h:0,quoteVolume24h:0}],["NEGATIVE",{priceChangePercent24h:-3,quoteVolume24h:10}],["POSITIVE",{priceChangePercent24h:2,quoteVolume24h:100}]]) as Map<string,Ticker>;
  assert.deepEqual(sortPairs(pairs,tickers,"change").map(p=>p.symbol),["POSITIVE","ZERO","NEGATIVE","UNKNOWN"]);
  assert.deepEqual(sortPairs(pairs,tickers,"volume").map(p=>p.symbol),["POSITIVE","NEGATIVE","ZERO","UNKNOWN"]);
});
