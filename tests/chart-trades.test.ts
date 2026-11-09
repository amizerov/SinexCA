import {test} from "node:test";
import assert from "node:assert/strict";
import {chartExecutions} from "../lib/paper/chart-trades";
import type {DemoFill} from "../lib/paper/orders";
const candle=(time:number)=>({time,open:100,high:105,low:95,close:101,volume:10});
const fill=(extra:Partial<DemoFill>={}):DemoFill=>({id:"one",orderId:"order",exchange:"bybit",symbol:"HYPEUSDT",base:"HYPE",quote:"USDT",side:"buy",price:100,quantity:1e8,quoteUnits:100e6,feeUnits:100000,receivedAt:61000,exchangeTime:null,...extra});
test("actual executions aggregate only within the same order, side and candle",()=>{
  const first=fill(),second=fill({id:"two",price:102,quantity:3e8,feeUnits:306000,quoteUnits:306e6}),third=fill({id:"three",orderId:"sell",side:"sell",price:103});
  const result=chartExecutions([first,second,first,third], [candle(60),candle(120)],"bybit","HYPEUSDT","1m");
  assert.equal(result.markers.length,2);const buy=result.markers.find(m=>m.side==="buy")!;assert.equal(buy.price,101.5);assert.equal(buy.quantity,4);assert.equal(buy.count,2);assert.equal(buy.feeUnits,406000);assert.equal(buy.quoteUnits,406e6);assert.equal(buy.time,60);
});
test("venue, quote pair, missing candles and exact interval boundaries are isolated",()=>{
  const result=chartExecutions([fill({id:"wrong-venue",exchange:"binance"}),fill({id:"wrong-pair",symbol:"HYPEUSD"}),fill({id:"before",receivedAt:59000}),fill({id:"gap",receivedAt:120000}),fill({id:"after",receivedAt:240000}),fill({id:"valid",receivedAt:180000})],[candle(60),candle(180)],"bybit","HYPEUSDT","1m");
  assert.equal(result.outside,3);assert.equal(result.markers.length,1);assert.equal(result.markers[0].time,180);
});
test("calendar months use real openings and exchange event time takes precedence",()=>{
  const jan=Date.UTC(2026,0,1)/1000,feb=Date.UTC(2026,1,1)/1000,mar=Date.UTC(2026,2,1)/1000;
  const result=chartExecutions([fill({id:"feb",exchangeTime:Date.UTC(2026,1,28,23,59),receivedAt:mar*1000}),fill({id:"mar",receivedAt:mar*1000})],[candle(jan),candle(feb),candle(mar)],"bybit","HYPEUSDT","1M");assert.deepEqual(result.markers.map(m=>m.time),[feb,mar]);
});
