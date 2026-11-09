import {test} from "node:test";
import assert from "node:assert/strict";
import {tradeWatchdog} from "../lib/market/trades/health";
import {htxTrades} from "../lib/market/trades/htx";
import {subscribeTrades,type TradeConnection} from "../lib/market/trades/stream";
import type {StreamStatus,TradingPair} from "../lib/market/types";
const pair:TradingPair={exchange:"htx",marketType:"spot",symbol:"ethbtc",baseAsset:"ETH",quoteAsset:"BTC"};
test("watchdog distinguishes quiet trades, missing subscription and dead transport",()=>{
  const now=100000;assert.deepEqual(tradeWatchdog(now,now-60000,0,now,true),{stale:true,close:false});assert.equal(tradeWatchdog(now,now-60000,0,now,false).close,true);assert.equal(tradeWatchdog(now,0,now,now-46000,true).close,true);assert.deepEqual(tradeWatchdog(now,now-60000,now,now,true),{stale:false,close:false});
});
test("HTX only acknowledges the requested channel",async()=>{
  const p=await htxTrades([pair],new AbortController().signal);assert.equal(p.isSubscribed?.({status:"ok",subbed:"market.ethbtc.trade.detail"}),true);assert.equal(p.isSubscribed?.({status:"ok",subbed:"market.btcusdt.trade.detail"}),false);assert.equal(p.isSubscribed?.({ping:123}),false);
});
test("quiet HTX keeps the acknowledged socket, old tape never marks prices live; real silence reconnects",async context=>{
  const Native=globalThis.WebSocket,sockets:FakeSocket[]=[],states:StreamStatus[]=[],connections:TradeConnection[]=[],prices:number[]=[],tape:number[]=[];
  class FakeSocket {static OPEN=1;readyState=0;binaryType="";sent:Record<string,unknown>[]=[];onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(){sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}send(value:string){this.sent.push(JSON.parse(value));}close(){this.readyState=3;this.onclose?.();}message(data:unknown){this.onmessage?.({data:JSON.stringify(data)});}}
  const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  context.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:1800000000000});globalThis.WebSocket=FakeSocket as unknown as typeof WebSocket;let stop=()=>{};
  try{
    stop=subscribeTrades("htx",[pair],{onStatus:s=>states.push(s),onConnection:c=>connections.push(c),onTicks:t=>prices.push(...t.map(t=>t.price)),onTrades:t=>tape.push(...t.map(t=>t.price))});await settle();context.mock.timers.tick(0);const ws=sockets[0];
    ws.message({status:"ok",subbed:"market.ethbtc.trade.detail"});ws.message({ch:"market.ethbtc.trade.detail",tick:{data:[{price:.028,amount:1,ts:Date.now()-7200000,direction:"buy",id:1}]}});await settle();context.mock.timers.tick(50);
    for(let i=0;i<12;i++){ws.message({ping:Date.now()});await settle();context.mock.timers.tick(10000);}
    assert.equal(sockets.length,1);assert.equal(ws.readyState,1);assert.equal(states.at(-1),"stale");assert.deepEqual(connections.at(-1),{connected:true,subscribed:true});assert.deepEqual(prices,[]);assert.deepEqual(tape,[.028]);assert.ok(ws.sent.some(m=>typeof m.pong==="number"));
    ws.message({ch:"market.ethbtc.trade.detail",tick:{data:[{price:.029,amount:2,ts:Date.now(),direction:"sell",id:2}]}});await settle();context.mock.timers.tick(50);assert.equal(states.at(-1),"live");assert.deepEqual(prices,[.029]);
    context.mock.timers.tick(46000);assert.equal(ws.readyState,3);assert.ok(connections.some(c=>!c.connected));
  }finally{stop();globalThis.WebSocket=Native;context.mock.timers.reset();}
});
