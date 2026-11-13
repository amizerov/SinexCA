import {test} from "node:test";
import assert from "node:assert/strict";
import {bingxCandles,bingxPairs,bingxTickers} from "../lib/market/exchanges/bingx-normalize";
import {bingxBook} from "../lib/market/orderbook/bingx";
import {bookProtocol} from "../lib/market/orderbook/protocols";
import {decodeForeignStream,streamSettings} from "../lib/market/stream";
import {tradeFactories} from "../lib/market/trades/registry";
import type {TradingPair} from "../lib/market/types";

const pair:TradingPair={exchange:"bingx",marketType:"spot",symbol:"BTC-USDT",baseAsset:"BTC",quoteAsset:"USDT"};

test("BingX catalog retains active spot symbols and native separators",()=>{
  const input={code:0,msg:"",data:{symbols:[{symbol:"BTC-USDT",status:1},{symbol:"ETH-USDC",status:1},{symbol:"OLD-USDT",status:0}]}};
  assert.deepEqual(bingxPairs(input,null).map(value=>[value.symbol,value.baseAsset,value.quoteAsset]),[["BTC-USDT","BTC","USDT"],["ETH-USDC","ETH","USDC"]]);
  assert.deepEqual(bingxPairs(input,"USDT").map(value=>value.symbol),["BTC-USDT"]);
});

test("BingX REST candles and tickers normalize into terminal models",()=>{
  assert.deepEqual(bingxCandles({code:0,data:[[100000,10,12,9,11,3,199999,30]]}),[{time:100,open:10,high:12,low:9,close:11,volume:3}]);
  const ticker=bingxTickers({code:0,data:[{symbol:"BTC-USDT",openPrice:10,highPrice:13,lowPrice:9,lastPrice:12,priceChangePercent:"20%",volume:3,quoteVolume:35,bidPrice:11,askPrice:12,bidQty:1,askQty:2,closeTime:123}]})[0];
  assert.equal(ticker.symbol,"BTC-USDT");assert.equal(ticker.priceChangePercent24h,20);assert.equal(ticker.quoteVolume24h,35);assert.equal(ticker.exchangeTime,123);
});

test("BingX public WebSocket decoders validate symbol, interval and timestamps",async()=>{
  const trades=await tradeFactories.bingx([pair],new AbortController().signal);
  assert.equal((trades.subscriptions[0] as {dataType:string}).dataType,"BTC-USDT@trade");
  const trade=trades.decode({dataType:"BTC-USDT@trade",data:[{T:1_750_000_000_123,s:"BTC-USDT",t:7,p:"12",q:"0.5",m:false}]})[0];
  assert.equal(trade.symbol,"BTC-USDT");assert.equal(trade.time,1_750_000_000_123);assert.equal(trade.side,"buy");
  assert.equal(trades.decode({dataType:"BTC-USDT@trade",data:{T:1_750_000_000_124,s:"BTC-USDT",t:8,p:"13",q:"0.1",m:true}})[0].side,"sell");
  assert.equal(trades.decode({dataType:"ETH-USDT@trade",data:[]}).length,0);
  const options={symbol:"BTC-USDT",timeframe:"1h" as const};
  assert.equal(streamSettings("bingx",options).url,"wss://open-api-ws.bingx.com/market");
  const candle=decodeForeignStream("bingx",{dataType:"BTC-USDT@kline_60min",data:{s:"BTC-USDT",K:{t:100000,o:10,h:12,l:9,c:11,v:3}}},options).candle;
  assert.deepEqual(candle,{time:100,open:10,high:12,low:9,close:11,volume:3});
});

test("BingX REST and WebSocket order books consume full snapshots",async()=>{
  const rest=bingxBook("BTC-USDT").decode({code:0,data:{ts:123,bids:[["10","2"]],asks:[["12","3"]]}});
  assert.deepEqual(rest.bids,[["10","2"]]);assert.deepEqual(rest.asks,[["12","3"]]);assert.equal(rest.time,123);
  const protocol=await bookProtocol(pair,new AbortController().signal);
  assert.equal((protocol?.subscriptions[0] as {dataType:string}).dataType,"BTC-USDT@depth20");
  const book=protocol?.decode({dataType:"BTC-USDT@depth20",data:{T:123,bids:[["10","2"]],asks:[["12","3"]]}});
  assert.equal(book?.bids[0].quantity,2);assert.equal(book?.asks[0].price,12);assert.equal(book?.exchangeTime,123);
});
