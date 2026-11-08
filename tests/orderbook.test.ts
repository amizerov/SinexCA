import {test} from "node:test";
import assert from "node:assert/strict";
import {makeBook,bookSpread,bookNumber} from "../lib/market/orderbook/model";
import {bookProtocol,bybitBookProtocol} from "../lib/market/orderbook/protocols";
import {coinbaseBook} from "../lib/market/orderbook/coinbase";
import {bitfinexBook} from "../lib/market/orderbook/bitfinex";
import type {TradingPair} from "../lib/market/types";
const pair:TradingPair={exchange:"bybit",marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"};
test("depth validates, sorts and truncates snapshots; spread and sub-cent prices retain precision",()=>{
  const data=makeBook("binance","PEPEUSDT",[["0.00000123","2"],["0.00000122","1"],["0.00000121","0"]],[["0.00000125","3"]]);
  assert.equal(data.bids.length,2);assert.equal(data.bids[0].price,0.00000123);assert.equal(bookNumber(data.bids[0].price),"0,00000123");assert.ok(bookSpread(data)!.value>0);
  assert.equal(makeBook("binance","BTCUSDT",Array.from({length:50},(_,i)=>[i+1,1]),[[100,1]]).bids.length,20);
  for(const row of [[0,1],[1,-1],["",1],[1,Infinity],[true,2]])assert.throws(()=>makeBook("binance","BTCUSDT",[row],[[100,1]]));
  assert.throws(()=>makeBook("binance","BTCUSDT",[[100,1]],[[99,1]]));
  assert.equal(bookSpread(makeBook("binance","BTCUSDT",[],[])),null);
  assert.equal(bookSpread(makeBook("binance","BTCUSDT",[[75839.3,1]],[[75839.31,1]]))!.value,.01);
});
test("Bybit applies deltas only to its own snapshot, deletes zero size, resets and isolates connections",()=>{
  const protocol=bybitBookProtocol(pair),frame=(type:string,u:number,b:unknown,a:unknown,s="BTCUSDT")=>({topic:`orderbook.50.${s}`,type,ts:Date.now(),data:{s,u,b,a}});
  assert.throws(()=>protocol.decode(frame("delta",2,[],[])));
  const snapshot=protocol.decode(frame("snapshot",10,[[100,2],[99,1]],[[101,3],[102,4]]))!;assert.equal(snapshot.bids[0].quantity,2);
  const update=protocol.decode(frame("delta",11,[[100,0],[99,5]],[[101,7]]))!;assert.equal(update.bids[0].price,99);assert.equal(update.bids[0].quantity,5);assert.equal(update.asks[0].quantity,7);
  assert.equal(protocol.decode(frame("delta",10,[[98,4]],[])),undefined);
  assert.equal(protocol.decode(frame("snapshot",20,[[99,1]],[[101,1]],"ETHUSDT")),undefined);
  assert.throws(()=>bybitBookProtocol(pair).decode(frame("delta",12,[],[])));
  const reset=protocol.decode(frame("snapshot",1,[[90,1]],[[91,1]]))!;assert.equal(reset.bids.length,1);assert.equal(reset.asks[0].price,91);
  assert.throws(()=>protocol.decode(frame("delta",1,[],[])));
});
test("snapshot channels check topic and instrument and never treat subscription acknowledgements as depth",async()=>{
  const signal=new AbortController().signal;
  const gate=await bookProtocol({...pair,exchange:"gate",symbol:"BTC_USDT"},signal);
  assert.equal(gate!.decode({channel:"spot.order_book",event:"subscribe",result:{status:"success"}}),undefined);
  assert.equal(gate!.decode({channel:"spot.order_book",event:"update",result:{s:"ETH_USDT",bids:[[100,1]],asks:[[101,1]]}}),undefined);
  assert.equal(gate!.decode({channel:"spot.order_book",event:"update",result:{s:"BTC_USDT",bids:[[100,1]],asks:[[101,1]]}})!.bids[0].price,100);
  const okx=await bookProtocol({...pair,exchange:"okx",symbol:"BTC-USDT"},signal);
  assert.equal(okx!.decode({event:"subscribe",arg:{channel:"books5",instId:"BTC-USDT"}}),undefined);
  assert.equal(okx!.decode({action:"snapshot",arg:{channel:"books5",instId:"BTC-USDT"},data:[{bids:[[100,1,"0","2"]],asks:[[101,1,"0","3"]],ts:String(Date.now())}]})!.asks[0].price,101);
});
test("REST adapters preserve Bitfinex signed sides and bound Coinbase full L2 responses",()=>{
  const b=bitfinexBook("tBTCUST").decode([[100,2,3],[101,1,-4]]);
  assert.equal(makeBook("bitfinex","tBTCUST",b.bids,b.asks).asks[0].quantity,4);
  const raw={bids:Array.from({length:30000},(_,i)=>[100000-i,1,1]),asks:Array.from({length:30000},(_,i)=>[100001+i,1,1])};
  const c=coinbaseBook("BTC-USD").decode(raw);assert.equal((c.bids as unknown[]).length,20);assert.equal(makeBook("coinbase","BTC-USD",c.bids,c.asks).bids[0].price,100000);
});
