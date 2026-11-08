import {test} from "node:test";
import assert from "node:assert/strict";
import {usdtVolume} from "../lib/market/usdt-volume";
import type {Ticker} from "../lib/market/types";
const ticker:Ticker={exchange:"coinbase",symbol:"COOKIE-USD",lastPrice:2,baseVolume24h:1000,quoteVolume24h:null,priceChangePercent24h:null,bid:null,ask:null,bidSize:null,askSize:null,high24h:3,low24h:1,exchangeTime:null,receivedAt:0};
test("native USDT turnover is exact, including zero",()=>{
  const pair={baseAsset:"COOKIE",quoteAsset:"USDT"};
  const value=usdtVolume(pair,{...ticker,quoteVolume24h:1234},2,undefined);
  assert.equal(value.value,1234);assert.equal(value.estimated,false);
  assert.equal(usdtVolume(pair,{...ticker,quoteVolume24h:0},2,undefined).value,0);
});
test("base-only volume uses selected price and converts USD by dividing by actual USDT/USD",()=>{
  const value=usdtVolume({baseAsset:"COOKIE",quoteAsset:"USD"},ticker,3,0.96);
  assert.equal(value.value,3125);assert.equal(value.estimated,true);
  assert.equal(usdtVolume({baseAsset:"COOKIE",quoteAsset:"USDT"},ticker,3,undefined).value,3000);
  assert.equal(usdtVolume({baseAsset:"COOKIE",quoteAsset:"USD"},{...ticker,quoteVolume24h:960},3,0.96).value,1000);
});
test("missing rates stay unknown and USDT base volume needs no assumed USD parity",()=>{
  const pair={baseAsset:"COOKIE",quoteAsset:"USD"};
  assert.equal(usdtVolume(pair,ticker,2,undefined).value,null);
  assert.equal(usdtVolume(pair,ticker,2,0).value,null);
  assert.equal(usdtVolume(pair,ticker,2,NaN).value,null);
  const value=usdtVolume({baseAsset:"USDT",quoteAsset:"USD"},ticker,2,undefined);
  assert.equal(value.value,1000);assert.equal(value.estimated,false);
});
