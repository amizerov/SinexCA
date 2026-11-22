import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultFuturesPosition,futuresPositionKey,futuresContractInfo,validateFuturesPosition} from "../lib/market/futures-settings";
import type {TradingPair} from "../lib/market/types";
const pair:TradingPair={exchange:"binance",marketType:"futures",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT",futuresInfo:{kind:"perpetual",maxLeverage:20,minQuantity:.001,quantityStep:.001}};
test("futures position settings reject exchange limits and nonnumeric amounts",()=>{
  const base=defaultFuturesPosition();assert.equal(validateFuturesPosition(base,pair),"");
  assert.match(validateFuturesPosition({...base,leverage:21},pair),/плечо/);
  assert.match(validateFuturesPosition({...base,quantity:"0.0005"},pair),/Минимальное/);
  assert.match(validateFuturesPosition({...base,quantity:"0.0015"},pair),/Шаг/);
  assert.equal(validateFuturesPosition({...base,quantity:"0.003"},pair),"");
  assert.notEqual(validateFuturesPosition({...base,stopLoss:"NaN"},pair),"");
  assert.notEqual(validateFuturesPosition({...base,takeProfit:"-10"},pair),"");
  assert.notEqual(futuresPositionKey("alice",pair),futuresPositionKey("bob",pair));
  assert.notEqual(futuresPositionKey("alice",pair),futuresPositionKey("alice",{...pair,exchange:"bybit"}));
});
test("instrument metadata preserves Coinbase expiry and normalizes funding and lot units",()=>{
  const bybit=futuresContractInfo("bybit",{fundingInterval:240,leverageFilter:{maxLeverage:"100"},lotSizeFilter:{minOrderQty:"0.001",qtyStep:"0.001"}});
  assert.equal(bybit.maxLeverage,100);assert.equal(bybit.fundingIntervalHours,4);assert.equal(bybit.quantityStep,.001);
  const expiry="2089-12-30T16:00:00Z",coinbase=futuresContractInfo("coinbase",{base_min_size:1,base_increment:1,future_product_details:{contract_expiry:expiry,funding_interval:"3600s"}},.01);
  assert.equal(coinbase.kind,"perpetual-style");assert.equal(coinbase.expiryAt,Date.parse(expiry));assert.equal(coinbase.minQuantity,.01);assert.equal(coinbase.fundingIntervalHours,1);
  assert.equal(futuresContractInfo("kucoin",{fundingRateGranularity:28800000,lotSize:1},.001).fundingIntervalHours,8);
  assert.equal(futuresContractInfo("bitfinex",{}).maxLeverage,undefined);
});
