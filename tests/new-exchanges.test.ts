import {test} from "node:test";
import assert from "node:assert/strict";
import {whitebitPairs,whitebitCandles,whitebitTickers} from "../lib/market/exchanges/whitebit-normalize";
import {cryptocomPairs,cryptocomCandles,cryptocomTickers} from "../lib/market/exchanges/cryptocom-normalize";
import {whitebitBookProtocol} from "../lib/market/orderbook/whitebit";
import {cryptocomBookProtocol} from "../lib/market/orderbook/cryptocom";
import {tradeFactories} from "../lib/market/trades/registry";
import {decodeForeignStream,streamSettings} from "../lib/market/stream";
import type {TradingPair,ExchangeId} from "../lib/market/types";
const pair=(exchange:ExchangeId):TradingPair=>({exchange,marketType:"spot",symbol:"BTC_USDT",baseAsset:"BTC",quoteAsset:"USDT"});
test("new catalogs exclude derivatives, disabled instruments and other quote currencies",()=>{
  const white={name:"BTC_USDT",stock:"BTC",money:"USDT",type:"spot",tradesEnabled:true};
  assert.equal(whitebitPairs([white,{...white,type:"futures"},{...white,tradesEnabled:false},{...white,money:"USD"},{...white,delistedAt:123}]).length,1);
  const crypto={symbol:"BTC_USDT",base_ccy:"BTC",quote_ccy:"USDT",inst_type:"CCY_PAIR",tradable:true};
  assert.equal(cryptocomPairs({code:0,result:{data:[crypto,{...crypto,inst_type:"PERPETUAL_SWAP"},{...crypto,tradable:false},{...crypto,quote_ccy:"USD"}]}}).length,1);
  assert.throws(()=>cryptocomPairs({code:400,result:{data:[]}}));
});
test("WhiteBIT OHLC positional order and Crypto.com change units normalize correctly",()=>{
  assert.deepEqual(whitebitCandles([[100,"10","11","12","9","3","33"]]),[{time:100,open:10,close:11,high:12,low:9,volume:3}]);
  assert.equal(cryptocomCandles([{t:100000,o:"10",c:"11",h:"12",l:"9",v:"3"}])[0].time,100);
  const white=whitebitTickers({success:true,result:{BTC_USDT:{at:100,ticker:{last:"11",change:"2.5",deal:"33",vol:"3",bid:"10",ask:"12",high:"13",low:"9"}}}},["BTC_USDT"])[0];
  assert.equal(white.quoteVolume24h,33);assert.equal(white.priceChangePercent24h,2.5);assert.equal(white.exchangeTime,100000);
  const crypto=cryptocomTickers({code:0,result:{data:[{i:"BTC_USDT",a:"11",c:"0.025",vv:"33",v:"3",b:"10",k:"12",h:"13",l:"9",t:100000}]}},["BTC_USDT"])[0];
  assert.equal(crypto.priceChangePercent24h,2.5);assert.equal(crypto.quoteVolume24h,null);assert.equal(crypto.baseVolume24h,3);
});
test("WhiteBIT depth needs a snapshot, deletes levels and detects broken update chains",()=>{
  const event=(snapshot:boolean,data:object)=>({method:"depth_update",params:[snapshot,data,"BTC_USDT"]});
  const book=whitebitBookProtocol(pair("whitebit"));
  assert.throws(()=>book.decode(event(false,{update_id:2,past_update_id:1,bids:[]})));
  assert.equal(book.decode(event(true,{update_id:10,bids:[[10,2],[9,1]],asks:[[12,3]],event_time:100}))?.exchangeTime,100000);
  const updated=book.decode(event(false,{update_id:15,past_update_id:10,bids:[[10,0],[9,5]]}));
  assert.equal(updated?.bids[0].price,9);assert.equal(updated?.bids[0].quantity,5);assert.equal(updated?.asks[0].quantity,3);
  assert.equal(book.decode(event(false,{update_id:14,past_update_id:10,bids:[]})),undefined);
  assert.throws(()=>book.decode(event(false,{update_id:20,past_update_id:16,bids:[]})));
  assert.throws(()=>whitebitBookProtocol(pair("whitebit")).decode(event(false,{update_id:16,past_update_id:15,bids:[]})));
});
test("Crypto.com snapshot mode cannot consume delta books and responds to heartbeat",()=>{
  const book=cryptocomBookProtocol(pair("cryptocom"));
  assert.equal(book.subscribeDelayMs,1000);
  assert.deepEqual(book.reply?.({id:9,method:"public/heartbeat"}),{id:9,method:"public/respond-heartbeat"});
  assert.equal(book.decode({result:{subscription:"book.BTC_USDT.50",instrument_name:"BTC_USDT",channel:"book.update",data:[{bids:[[10,1]],asks:[[12,2]]}]}}),undefined);
  assert.equal(book.decode({result:{subscription:"book.BTC_USDT.50",instrument_name:"BTC_USDT",channel:"book",data:[{bids:[[10,1,2]],asks:[[12,2,3]],t:100000}]}})?.bids[0].quantity,1);
});
test("new trade streams sort initial trade batches oldest first; candle streams validate symbol and interval",async()=>{
  const white=await tradeFactories.whitebit([pair("whitebit")],new AbortController().signal);
  assert.deepEqual(white.decode({method:"trades_update",params:["BTC_USDT",[{time:101,price:"11"},{time:100,price:"10"}]]}).map(t=>t.price),[10,11]);
  const crypto=await tradeFactories.cryptocom([pair("cryptocom")],new AbortController().signal);
  assert.deepEqual(crypto.decode({result:{channel:"trade",instrument_name:"BTC_USDT",data:[{t:101000,p:"11"},{t:100000,p:"10"}]}}).map(t=>t.price),[10,11]);
  const options={symbol:"BTC_USDT",timeframe:"1h" as const};
  assert.equal(decodeForeignStream("whitebit",{method:"candles_update",params:[[100,"10","11","12","9","3","33","BTC_USDT"]]},options).candle?.close,11);
  assert.equal(decodeForeignStream("whitebit",{method:"candles_update",params:[[100,"10","11","12","9","3","33","ETH_USDT"]]},options).candle,undefined);
  assert.equal(decodeForeignStream("cryptocom",{result:{instrument_name:"BTC_USDT",subscription:"candlestick.1h.BTC_USDT",data:[{t:100000,o:10,h:12,l:9,c:11,v:3}]}},options).candle?.close,11);
  assert.equal(streamSettings("whitebit",options).url,"wss://wss.whitebit.com/ws");
});
