import { exchangeTimeframes,EXCHANGE_INTERVALS } from "../lib/market/intervals.ts";
import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002";
const symbols={binance:"BTCUSDT",bybit:"BTCUSDT",okx:"BTC-USDT",bitget:"BTCUSDT",gate:"BTC_USDT",kraken:"XBTUSDT",coinbase:"BTC-USD",kucoin:"BTC-USDT",bitfinex:"tBTCUST",htx:"btcusdt",mexc:"BTCUSDT",whitebit:"BTC_USDT",cryptocom:"BTC_USDT"},report=[];
await Promise.all(Object.keys(EXCHANGE_INTERVALS).map(async exchange=>{
  for(const timeframe of exchangeTimeframes(exchange)){
    const query=new URLSearchParams({exchange,symbol:symbols[exchange],timeframe,limit:"3"});
    try{const response=await fetch(`${baseURL}/api/market/candles?${query}`,{signal:AbortSignal.timeout(30000)}),json=await response.json();assert.equal(response.status,200,JSON.stringify(json.error));assert.ok(json.data.length>0&&json.data.length<=3);assert.ok(json.data.every((c,i,a)=>c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&(!i||c.time>a[i-1].time)));report.push({exchange,timeframe,ok:true,count:json.data.length});console.log("PASS",exchange,timeframe,json.data.length);}catch(error){report.push({exchange,timeframe,ok:false,error:String(error)});console.error("FAIL",exchange,timeframe,String(error));}
    await new Promise(resolve=>setTimeout(resolve,exchange==="bitfinex"?2100:exchange==="kraken"?1100:250));
  }
}));
await mkdir(".qa",{recursive:true});await writeFile(".qa/all-intervals.json",JSON.stringify({checkedAt:new Date().toISOString(),report},null,2));assert.ok(report.every(row=>row.ok),"Some intervals failed; see .qa/all-intervals.json");console.log("PASS all intervals:",report.length);
