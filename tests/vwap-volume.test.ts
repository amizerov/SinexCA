import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeCandles} from "../lib/market/normalize";
import {foreignCandles} from "../lib/market/exchanges/foreign-normalize";
import {extraCandles} from "../lib/market/exchanges/extra-normalize";
import {whitebitCandles} from "../lib/market/exchanges/whitebit-normalize";
import {cryptocomCandles} from "../lib/market/exchanges/cryptocom-normalize";
import {bingxCandles} from "../lib/market/exchanges/bingx-normalize";
test("all 14 spot REST adapters supply base volume, never quote turnover, to VWAP",()=>{
  const row=[60000,10,12,9,11,5,999,999],expected={time:60,open:10,high:12,low:9,close:11,volume:5};
  const values={
    binance:normalizeCandles([row]),
    bybit:foreignCandles("bybit",{retCode:0,result:{list:[row]}}),
    okx:foreignCandles("okx",{code:"0",data:[row]}),
    bitget:foreignCandles("bitget",{code:"00000",data:[row]}),
    gate:foreignCandles("gate",[[60,999,11,12,9,10,5,true]]),
    kraken:foreignCandles("kraken",{error:[],result:{PAIR:[[60,10,12,9,11,999,5,10]],last:60}}),
    coinbase:foreignCandles("coinbase",[[60,9,12,10,11,5]]),
    kucoin:extraCandles("kucoin",{code:"200000",data:[[60,10,11,12,9,5,999]]}),
    bitfinex:extraCandles("bitfinex",[[60000,10,11,12,9,5]]),
    htx:extraCandles("htx",{status:"ok",data:[{id:60,open:10,high:12,low:9,close:11,amount:5,vol:999}]}),
    mexc:extraCandles("mexc",[row]),
    whitebit:whitebitCandles([[60,10,11,12,9,5,999]]),
    cryptocom:cryptocomCandles([{t:60000,o:10,h:12,l:9,c:11,v:5,vv:999}]),
    bingx:bingxCandles({code:0,data:[row]}),
  };
  for(const [exchange,candles] of Object.entries(values))assert.deepEqual(candles,[expected],exchange);
});
