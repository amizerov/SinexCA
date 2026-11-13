import {test} from "node:test";
import assert from "node:assert/strict";
import {geminiCandles,geminiOverview,geminiPairs,geminiTicker} from "../lib/market/exchanges/gemini-normalize";
import {geminiBook} from "../lib/market/orderbook/gemini";
import {bookProtocol} from "../lib/market/orderbook/protocols";
import {decodeForeignStream,streamSettings} from "../lib/market/stream";
import {tradeFactories} from "../lib/market/trades/registry";
import type {TradingPair} from "../lib/market/types";

const pair:TradingPair={exchange:"gemini",marketType:"spot",symbol:"btcusd",baseAsset:"BTC",quoteAsset:"USD"};

test("Gemini catalog parses compact spot symbols and excludes perpetuals",()=>{
  const pairs=geminiPairs(["btcusd","btcusdt","dogebtc","efilfil","btcgusdperp"],null);
  assert.deepEqual(pairs.map(value=>[value.symbol,value.baseAsset,value.quoteAsset]),[
    ["btcusd","BTC","USD"],["btcusdt","BTC","USDT"],["dogebtc","DOGE","BTC"],["efilfil","EFIL","FIL"],
  ]);
  assert.deepEqual(geminiPairs(["btcusd","btcusdt"],"USD").map(value=>value.symbol),["btcusd"]);
});

test("Gemini REST candles and tickers normalize into terminal models",()=>{
  assert.deepEqual(geminiCandles([[100000,10,12,9,11,3]]),[{time:100,open:10,high:12,low:9,close:11,volume:3}]);
  const ticker=geminiTicker({symbol:"BTCUSD",open:"10",high:"13",low:"9",close:"12",bid:"11",ask:"12"})[0];
  assert.equal(ticker.symbol,"btcusd");assert.equal(ticker.priceChangePercent24h,20);assert.equal(ticker.high24h,13);
  const overview=geminiOverview([{pair:"BTCUSD",price:"12",percentChange24h:"2.5"}])[0];
  assert.equal(overview.symbol,"btcusd");assert.equal(overview.priceChangePercent24h,2.5);
});

test("Gemini public WebSocket decoders validate symbols and timestamps",async()=>{
  const trades=await tradeFactories.gemini([pair],new AbortController().signal);
  assert.deepEqual(trades.subscriptions,[{id:"sinex-trades",method:"SUBSCRIBE",params:["btcusd@trade"]}]);
  const tick=trades.decode({E:1_750_000_000_123_000_000,s:"btcusd",t:7,p:"12",q:"0.5",m:false})[0];
  assert.equal(tick.symbol,"btcusd");assert.equal(tick.time,1_750_000_000_123);assert.equal(tick.side,"buy");
  assert.equal(trades.decode({E:1_750_000_000_123_000_000,s:"ethusd",p:"12"}).length,0);
  const options={symbol:"btcusd",timeframe:"1h" as const};
  assert.equal(streamSettings("gemini",options).url,"wss://ws.gemini.com");
  assert.equal(decodeForeignStream("gemini",{s:"btcusd",p:"12"},options).price,12);
  assert.equal(decodeForeignStream("gemini",{s:"ethusd",p:"12"},options).price,undefined);
});

test("Gemini REST and stream order books consume full snapshots",async()=>{
  const rest=geminiBook("btcusd").decode({bids:[{price:"10",amount:"2"}],asks:[{price:"12",amount:"3"}]});
  assert.deepEqual(rest.bids,[["10","2"]]);assert.deepEqual(rest.asks,[["12","3"]]);
  const protocol=await bookProtocol(pair,new AbortController().signal);
  assert.deepEqual(protocol?.subscriptions,[{id:"sinex-depth",method:"SUBSCRIBE",params:["btcusd@depth20@100ms"]}]);
  const book=protocol?.decode({lastUpdateId:2,bids:[["10","2"]],asks:[["12","3"]]});
  assert.equal(book?.bids[0].quantity,2);assert.equal(book?.asks[0].price,12);
});
