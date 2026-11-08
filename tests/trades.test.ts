import {test} from "node:test";
import assert from "node:assert/strict";
import type {TradingPair} from "../lib/market/types";
import {binanceTrades} from "../lib/market/trades/binance";
import {bybitTrades} from "../lib/market/trades/bybit";
import {okxTrades} from "../lib/market/trades/okx";
import {bitgetTrades} from "../lib/market/trades/bitget";
import {gateTrades} from "../lib/market/trades/gate";
import {krakenTrades} from "../lib/market/trades/kraken";
import {bitfinexTrades} from "../lib/market/trades/bitfinex";
import {htxTrades} from "../lib/market/trades/htx";
import {mexcTrades} from "../lib/market/trades/mexc";
import {tick} from "../lib/market/trades/types";
import {subscribeTrades} from "../lib/market/trades/stream";
import {coinbaseTrades} from "../lib/market/trades/coinbase";
import {mergeTrades} from "../lib/market/trades/tape";
const pairs:TradingPair[]=[{exchange:"binance",marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"}],signal=new AbortController().signal;
test("trade decoders validate market identity and use execution price/time, not candle close or bid",async()=>{
  const time=Date.now();
  const cases=[
    [binanceTrades,{data:{e:"trade",s:"BTCUSDT",p:"100",T:time}}],
    [bybitTrades,{topic:"publicTrade.BTCUSDT",data:[{s:"BTCUSDT",p:"100",T:time}]}],
    [okxTrades,{arg:{channel:"trades",instId:"BTCUSDT"},data:[{instId:"BTCUSDT",px:"100",ts:String(time)}]}],
    [bitgetTrades,{arg:{channel:"trade",instId:"BTCUSDT"},data:[{price:"100",ts:String(time)}]}],
    [gateTrades,{channel:"spot.trades",event:"update",result:{currency_pair:"BTCUSDT",price:"100",create_time_ms:String(time)}}],
    [krakenTrades,{channel:"trade",data:[{symbol:"BTC/USDT",price:100,timestamp:new Date(time).toISOString()}]}],
    [htxTrades,{ch:"market.btcusdt.trade.detail",tick:{data:[{price:100,ts:time}]}}],
  ] as const;
  for(const [factory,input]of cases){const protocol=await factory(pairs,signal),ticks=protocol.decode(input);assert.equal(ticks.length,1);assert.equal(ticks[0].price,100);assert.equal(ticks[0].time,time);assert.deepEqual(protocol.decode({type:"pong"}),[]);}
  const bybit=await bybitTrades(pairs,signal);assert.deepEqual(bybit.decode({topic:"publicTrade.ETHUSDT",data:[{s:"BTCUSDT",p:"100",T:time}]}),[]);
  assert.deepEqual(tick("BTCUSDT",0,time),[]);assert.deepEqual(tick("BTCUSDT","NaN",time),[]);assert.deepEqual(tick("BTCUSDT",100,undefined),[]);
});
test("Bitfinex binds channel acknowledgements and ignores old snapshots and duplicate trade execution events",async()=>{
  const protocol=await bitfinexTrades(pairs,signal),time=Date.now();protocol.decode({event:"subscribed",channel:"trades",symbol:"BTCUSDT",chanId:7});
  assert.equal(protocol.decode([7,"tu",[1,time,2,100]])[0].price,100);assert.deepEqual(protocol.decode([8,"tu",[1,time,2,100]]),[]);assert.deepEqual(protocol.decode([7,"te",[1,time,2,100]]),[]);assert.deepEqual(protocol.decode([7,[[1,time,2,100]]]),[]);
});
test("Bybit subscriptions respect the 10-topic spot request limit",async()=>{const protocol=await bybitTrades(Array.from({length:20},(_,i)=>({...pairs[0],symbol:`COIN${i}USDT`})),signal);assert.equal(protocol.subscriptions.length,2);for(const request of protocol.subscriptions)assert.equal((request as {args:string[]}).args.length,10);});
const integer=(number:number)=>{const bytes=[];while(number>=128){bytes.push(number%128+128);number=Math.floor(number/128);}return [...bytes,number];};
const field=(key:number,value:string|number[])=>{const data=typeof value==="string"?[...new TextEncoder().encode(value)]:value;return [...integer(key*8+2),...integer(data.length),...data];};
test("MEXC aggregated deal protobuf retains repeated trades and validates public channel identity",async()=>{
  const time=Date.now(),deal=(price:string)=>[...field(1,price),...integer(4*8),...integer(time)],payload=[...field(1,deal("100")),...field(1,deal("101"))],wrapper=new Uint8Array([...field(1,"spot@public.aggre.deals.v3.api.pb@100ms@BTCUSDT"),...field(3,"BTCUSDT"),...field(314,payload)]);
  const protocol=await mexcTrades(pairs,signal),ticks=protocol.decode(wrapper.buffer);assert.deepEqual(ticks.map(t=>t.price),[100,101]);assert.equal(ticks[1].time,time);assert.deepEqual(protocol.decode(new Uint8Array(field(314,payload)).buffer),[]);
});
test("trade transport coalesces bursts, ignores older/wrong-market ticks and fully closes subscriptions",async()=>{
  const Native=globalThis.WebSocket,sockets:FakeSocket[]=[],updates:number[]=[],tape:number[]=[];
  class FakeSocket {static OPEN=1;readyState=0;binaryType="";onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;onclose:(()=>void)|null=null;constructor(){sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}send(){}close(){this.readyState=3;this.onclose?.();}message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}}
  globalThis.WebSocket=FakeSocket as unknown as typeof WebSocket;let stop=()=>{};
  try{stop=subscribeTrades("bybit",pairs,{onStatus(){},onTicks:ticks=>updates.push(...ticks.map(tick=>tick.price)),onTrades:ticks=>tape.push(...ticks.map(tick=>tick.price))});await new Promise(resolve=>setTimeout(resolve,10));const ws=sockets[0],time=Date.now();
    const message=(symbol:string,price:number,t:number)=>({topic:`publicTrade.${symbol}`,data:[{s:symbol,p:price,T:t}]});
    ws.message(message("BTCUSDT",100,time-5));ws.message(message("BTCUSDT",101,time));ws.message(message("BTCUSDT",99,time-10));ws.message(message("ETHUSDT",999,time));ws.message(message("BTCUSDT",999,time+120000));
    await new Promise(resolve=>setTimeout(resolve,100));assert.deepEqual(updates,[101]);assert.deepEqual(tape,[100,101,99]);stop();assert.equal(ws.readyState,3);assert.equal(ws.onmessage,null);assert.equal(ws.onopen,null);
  }finally{stop();globalThis.WebSocket=Native;}
});
test("trade tape preserves sizes, aggressor sides and IDs; unknown sizes remain unknown",async()=>{
  const now=Date.now(),binance=await binanceTrades(pairs,signal),t=binance.decode({data:{e:"trade",s:"BTCUSDT",p:"101",T:now,q:"2.5",m:true,t:123}})[0];
  assert.equal(t.quantity,2.5);assert.equal(t.side,"sell");assert.equal(t.id,"123");assert.equal(tick("BTCUSDT",101,now)[0].quantity,undefined);
  const cb=await coinbaseTrades(pairs,signal);const c=cb.decode({type:"match",product_id:"BTCUSDT",price:"101",size:"0.5",side:"sell",trade_id:5,time:new Date(now).toISOString()})[0];assert.equal(c.side,"buy");assert.equal(c.quantity,0.5);assert.equal(c.id,"5");
  const a={...t,id:"a",time:now-1},b={...t,id:"b"};assert.deepEqual(mergeTrades([a],[b,b,a]).map(t=>t.id),["b","a"]);assert.equal(mergeTrades([],Array.from({length:1000},(_,i)=>({...t,id:String(i)}))).length,500);
  assert.equal(mergeTrades([], [{...t,id:undefined},{...t,id:undefined}]).length,2,"Same-price trades without IDs are not invented duplicates");
});
