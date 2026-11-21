import {test} from "node:test";
import assert from "node:assert/strict";
import {opportunities,depthEstimate,fallbackComparisonPairs,pairForAsset,type ComparisonQuote} from "../lib/market/comparison/model";
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
  assert.equal(batch.subscriptions.length,2);assert.ok(batch.subscriptions.every(subscription=>Array.isArray((subscription as {args?:unknown[]}).args)&&(subscription as {args:unknown[]}).args.length<=10));
  assert.deepEqual((bybit.subscriptions[0] as {args:string[]}).args,["orderbook.1.BTCUSDT"]);
  const input={topic:"orderbook.1.BTCUSDT",type:"snapshot",ts:now,data:{s:"BTCUSDT",b:[["100","2"]],a:[["101","3"]]}};
  assert.equal(bybit.decode(input,now).length,1);assert.equal(bybit.decode({...input,type:"delta"},now).length,0);
  assert.equal(bybit.decode({...input,ts:now-30000},now).length,0);
  const okx=comparisonProtocol("okx",[{...pair,exchange:"okx",symbol:"BTC-USDT"}])!;
  assert.equal(okx.decode({arg:{channel:"tickers",instId:"BTC-USDT"},data:[{instId:"BTC-USDT",bidPx:"100",askPx:"101",bidSz:"1",askSz:"2",ts:now}]},now).length,1);
});
test("every comparison venue has a BBO WebSocket protocol and validates its native symbol",()=>{
  const pair=(exchange:ComparisonQuote["exchange"],symbol:string,baseAsset="BTC")=>({exchange,marketType:"spot" as const,symbol,baseAsset,quoteAsset:"USDT"});
  const check=(exchange:ComparisonQuote["exchange"],symbol:string,input:unknown,setup?:unknown)=>{
    const protocol=comparisonProtocol(exchange,[pair(exchange,symbol)],setup as never)!;assert.ok(protocol,exchange);
    const quotes=protocol.decode(input,now);assert.equal(quotes.length,1,exchange);assert.equal(quotes[0].symbol,symbol);assert.equal(quotes[0].bid,100);assert.equal(quotes[0].ask,101);assert.equal(quotes[0].source,"ws");
  };
  check("bitget","BTCUSDT",{arg:{instType:"SPOT",channel:"ticker",instId:"BTCUSDT"},data:[{bidPr:"100",askPr:"101",bidSz:"2",askSz:"3",lastPr:"100.5"}]});
  check("gate","BTC_USDT",{channel:"spot.book_ticker",event:"update",result:{s:"BTC_USDT",b:"100",a:"101",B:"2",A:"3"}});
  check("kraken","XXBTZUSDT",{channel:"ticker",data:[{symbol:"BTC/USDT",bid:100,ask:101,bid_qty:2,ask_qty:3,last:100.5}]});
  check("coinbase","BTC-USDT",{type:"ticker",product_id:"BTC-USDT",best_bid:"100",best_ask:"101",best_bid_size:"2",best_ask_size:"3",price:"100.5"});
  check("kucoin","BTC-USDT",{type:"message",subject:"trade.ticker",topic:"/market/ticker:BTC-USDT",data:{bestBid:"100",bestAsk:"101",bestBidSize:"2",bestAskSize:"3",price:"100.5"}},{endpoint:"wss://ws-api-spot.kucoin.com/",token:"token",pingInterval:18000});
  const bitfinex=comparisonProtocol("bitfinex",[pair("bitfinex","tBTCUST")])!;bitfinex.decode({event:"subscribed",channel:"ticker",chanId:7,symbol:"tBTCUST"},now);assert.equal(bitfinex.decode([7,[100,2,101,3,1,.01,100.5]],now).length,1);
  check("htx","btcusdt",{ch:"market.btcusdt.bbo",tick:{symbol:"btcusdt",bid:100,ask:101,bidSize:2,askSize:3}});
  check("whitebit","BTC_USDT",{method:"bookTicker_update",params:[[1,2,"BTC_USDT",3,"100","2","101","3"]]});
  check("cryptocom","BTC_USDT",{result:{channel:"ticker",instrument_name:"BTC_USDT",data:[{i:"BTC_USDT",b:"100",k:"101",a:"100.5"}]}});
  check("bingx","BTC-USDT",{dataType:"BTC-USDT@depth20",data:{bids:[["99","1"],["100","2"]],asks:[["102","1"],["101","3"]]}});
  const varint=(value:number)=>{const result:number[]=[];do{let byte=value&127;value=Math.floor(value/128);if(value)byte|=128;result.push(byte);}while(value);return result;};
  const field=(id:number,value:string|number[])=>{const bytes=typeof value==="string"?[...new TextEncoder().encode(value)]:value;return [...varint(id*8+2),...varint(bytes.length),...bytes];};
  const payload=[...field(1,"100"),...field(2,"2"),...field(3,"101"),...field(4,"3")],channel="spot@public.aggre.bookTicker.v3.api.pb@100ms@BTCUSDT";
  const wrapper=new Uint8Array([...field(1,channel),...field(315,payload),...field(3,"BTCUSDT")]).buffer;
  check("mexc","BTCUSDT",wrapper);
  for(const exchange of ["binance","bybit","okx","bitget","gate","kraken","coinbase","kucoin","bitfinex","htx","mexc","whitebit","cryptocom","bingx"] as const){
    const symbol=exchange==="kraken"?"XXBTZUSDT":exchange==="bitfinex"?"tBTCUST":["okx","coinbase","kucoin","bingx"].includes(exchange)?"BTC-USDT":["gate","whitebit","cryptocom"].includes(exchange)?"BTC_USDT":exchange==="htx"?"btcusdt":"BTCUSDT";
    assert.ok(comparisonProtocol(exchange,[pair(exchange,symbol)],exchange==="kucoin"?{endpoint:"wss://ws-api-spot.kucoin.com/",token:"token",pingInterval:18000}:undefined),exchange);
  }
  const gate=comparisonProtocol("gate",[pair("gate","BTC_USDT"),pair("gate","ETH_USDT","ETH")])!;
  assert.deepEqual((gate.subscriptions[0] as {payload:string[]}).payload,["BTC_USDT","ETH_USDT"]);
  assert.equal(comparisonProtocol("htx",[pair("htx","btcusdt")])!.subscriptionIntervalMs,100);
});
test("comparison streams have deterministic fallback symbols when REST catalogs fail",()=>{
  assert.equal(fallbackComparisonPairs("bybit")[0].symbol,"BTCUSDT");
  assert.equal(fallbackComparisonPairs("gate")[0].symbol,"BTC_USDT");
  assert.equal(fallbackComparisonPairs("kraken")[0].symbol,"BTCUSDT");
  assert.equal(fallbackComparisonPairs("kucoin")[0].symbol,"BTC-USDT");
  assert.equal(fallbackComparisonPairs("htx")[0].symbol,"btcusdt");
  assert.equal(fallbackComparisonPairs("bitfinex")[0].symbol,"tBTCUST");
});
