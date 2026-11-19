import {test} from "node:test";
import assert from "node:assert/strict";
import {opportunities,depthEstimate,pairForAsset,type ComparisonQuote} from "../lib/market/comparison/model";
import {comparisonProtocol} from "../lib/market/comparison/protocol";
import type {OrderBook} from "../lib/market/orderbook/model";
const now=100000;
const quote=(exchange:ComparisonQuote["exchange"],bid:number,ask:number):ComparisonQuote=>({exchange,asset:"BTC",symbol:"BTCUSDT",bid,ask,bidSize:20,askSize:20,last:99999,receivedAt:now,source:"ws"});
test("scanner uses cross-venue ask/bid and both fees, never last trades",()=>{
  const rows=opportunities([quote("binance",99,100),quote("bybit",102,103)],{binance:.1,bybit:.2},1000,now);
  const buy=rows.find(row=>row.buy.exchange==="binance")!;
  assert.equal(buy.grossPercent,2.0000000000000018);
  assert.ok(Math.abs(buy.estimatedProfit-(1000/100.1*102*.998-1000))<1e-8);
  assert.equal(buy.topSizeSufficient,true);assert.equal(rows.length,2);
});
test("stale, future, unsynchronized, missing bid/ask and same-venue quotes cannot create routes",()=>{
  const a=quote("binance",99,100),b=quote("bybit",102,103),fees={binance:.1,bybit:.1};
  for(const patch of [{receivedAt:now-15001},{receivedAt:now+2000},{receivedAt:now-5001},{bid:null,ask:null},{bid:Infinity,ask:Infinity}])assert.equal(opportunities([a,{...b,...patch}],fees,1000,now).length,0);
  assert.equal(opportunities([a,{...b,exchange:"binance"}],fees,1000,now).length,0);
  assert.equal(opportunities([a,b],{binance:-1,bybit:.1},1000,now).length,0);
  assert.equal(opportunities([a,b],fees,NaN,now).length,0);
  assert.equal(opportunities([a,{...b,asset:"ETH"}],fees,1000,now).length,0);
});
test("pair matching accepts only an unambiguous spot base asset and USDT",()=>{
  const pair={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"};
  assert.equal(pairForAsset([pair],"BTC"),pair);
  assert.equal(pairForAsset([{...pair,quoteAsset:"USDC"}],"BTC"),undefined);
  assert.equal(pairForAsset([pair,{...pair,symbol:"BTC-USDT"}],"BTC"),undefined);
});
test("depth consumes multiple sorted levels and includes both fees in quote currency",()=>{
  const buy:OrderBook={exchange:"binance",symbol:"BTCUSDT",bids:[],asks:[{price:101,quantity:1},{price:100,quantity:1}],receivedAt:now,exchangeTime:null};
  const sell:OrderBook={exchange:"bybit",symbol:"BTCUSDT",asks:[],bids:[{price:104,quantity:1},{price:105,quantity:1}],receivedAt:now,exchangeTime:null};
  const estimate=depthEstimate(buy,sell,202.005,.5,1,now);assert.equal(estimate.complete,true);
  if(estimate.complete){assert.ok(Math.abs(estimate.quantity-2)<1e-8);assert.ok(Math.abs(estimate.profit-4.905)<1e-8);assert.equal(estimate.buyAverage,100.5);}
  assert.equal(depthEstimate(buy,sell,1000,.5,1,now).complete,false);
  assert.equal(depthEstimate(buy,{...sell,bids:[{price:105,quantity:.01}]},202.005,.5,1,now).complete,false);
  assert.throws(()=>depthEstimate(buy,{...sell,receivedAt:now-3001},100,.5,1,now),/устарели/);
  assert.throws(()=>depthEstimate(buy,sell,-1,.5,1,now));
});
test("real-time protocols validate symbols, full spot snapshots, quote values and timestamps",()=>{
  const pair={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"};
  const binance=comparisonProtocol("binance",[pair])!;
  assert.equal(binance.decode({data:{s:"BTCUSDT",b:"100",a:"101",B:"2",A:"3"}},now)[0].bidSize,2);
  assert.equal(binance.decode({data:{s:"ETHUSDT",b:"100",a:"101"}},now).length,0);
  assert.equal(binance.decode({data:{s:"BTCUSDT",b:"102",a:"101"}},now).length,0);
  const bybit=comparisonProtocol("bybit",[{...pair,exchange:"bybit"}])!;
  const batch=comparisonProtocol("bybit",Array.from({length:20},(_,i)=>({...pair,exchange:"bybit" as const,symbol:`COIN${i}USDT` })))!;
  assert.equal(batch.subscriptions.length,2);assert.ok(batch.subscriptions.every(subscription=>subscription.args.length<=10));
  const input={topic:"tickers.BTCUSDT",type:"snapshot",ts:now,data:{symbol:"BTCUSDT",bid1Price:"100",ask1Price:"101",bid1Size:"2",ask1Size:"3",lastPrice:"100.5"}};
  assert.equal(bybit.decode(input,now).length,1);assert.equal(bybit.decode({...input,type:"delta"},now).length,0);
  assert.equal(bybit.decode({...input,ts:now-30000},now).length,0);
  const okx=comparisonProtocol("okx",[{...pair,exchange:"okx",symbol:"BTC-USDT"}])!;
  assert.equal(okx.decode({arg:{channel:"tickers"},data:[{instId:"BTC-USDT",bidPx:"100",askPx:"101",bidSz:"1",askSz:"2",ts:now}]},now).length,1);
});
