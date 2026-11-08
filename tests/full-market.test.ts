import {test} from "node:test";
import assert from "node:assert/strict";
import {choosePairs} from "../lib/market/exchange-config";
import {foreignPairs} from "../lib/market/exchanges/foreign-normalize";
import {extraPairs} from "../lib/market/exchanges/extra-normalize";
import {normalizeTickerBatch} from "../lib/market/normalize";
test("full market lists retain instruments beyond the former twenty-pair limit",()=>{
  const pairs=Array.from({length:125},(_,i)=>({exchange:"bybit" as const,marketType:"spot" as const,baseAsset:`COIN${i}`,quoteAsset:"USDT",symbol:`COIN${i}USDT`}));
  assert.equal(choosePairs(pairs).length,125);
  assert.equal(foreignPairs("bybit",{retCode:0,result:{list:pairs.map(p=>({symbol:p.symbol,baseCoin:p.baseAsset,quoteCoin:p.quoteAsset,status:"Trading"}))}}).length,125);
  assert.equal(extraPairs("kucoin",{code:"200000",data:pairs.map(p=>({symbol:p.symbol,baseCurrency:p.baseAsset,quoteCurrency:p.quoteAsset,enableTrading:true}))}).length,125);
});
test("bulk snapshots keep valid prices and nullable fields when newly listed markets have no trades",()=>{
  const ticker={symbol:"BTC-USD",lastPrice:100,priceChangePercent:1,quoteVolume:null,bidPrice:null,askPrice:null,bidQty:null,askQty:null,highPrice:110,lowPrice:90,closeTime:null};
  const rows=normalizeTickerBatch([ticker,{...ticker,symbol:"NEW-USD",lastPrice:0},{...ticker,symbol:"BAD-USD",lastPrice:"NaN"}],1234,"coinbase");
  assert.equal(rows.length,1);assert.equal(rows[0].bid,null);assert.equal(rows[0].quoteVolume24h,null);assert.equal(rows[0].receivedAt,1234);
});
