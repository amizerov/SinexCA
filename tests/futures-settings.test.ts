import {test} from "node:test";
import assert from "node:assert/strict";
import {futuresContractInfo} from "../lib/market/futures-settings";
test("instrument metadata preserves Coinbase expiry and normalizes funding and lot units",()=>{
  const bybit=futuresContractInfo("bybit",{fundingInterval:240,leverageFilter:{maxLeverage:"100"},lotSizeFilter:{minOrderQty:"0.001",qtyStep:"0.001"}});
  assert.equal(bybit.maxLeverage,100);assert.equal(bybit.fundingIntervalHours,4);assert.equal(bybit.quantityStep,.001);
  const expiry="2089-12-30T16:00:00Z",coinbase=futuresContractInfo("coinbase",{base_min_size:1,base_increment:1,future_product_details:{contract_expiry:expiry,funding_interval:"3600s"}},.01);
  assert.equal(coinbase.kind,"perpetual-style");assert.equal(coinbase.expiryAt,Date.parse(expiry));assert.equal(coinbase.minQuantity,.01);assert.equal(coinbase.fundingIntervalHours,1);
  assert.equal(futuresContractInfo("kucoin",{fundingRateGranularity:28800000,lotSize:1},.001).fundingIntervalHours,8);
  assert.equal(futuresContractInfo("bitfinex",{}).maxLeverage,undefined);
});
