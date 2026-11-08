import { subscribeMarketStream } from "../lib/market/stream.ts";
import { exchangeTimeframes,wsInterval } from "../lib/market/intervals.ts";
import { mkdir,writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const symbols={binance:"BTCUSDT",bybit:"BTCUSDT",okx:"BTC-USDT",bitget:"BTCUSDT",gate:"BTC_USDT",kraken:"XBTUSDT",kucoin:"BTC-USDT",bitfinex:"tBTCUST",htx:"btcusdt",mexc:"BTCUSDT",whitebit:"BTC_USDT",cryptocom:"BTC_USDT"};
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>originalFetch(typeof input==="string"&&input.startsWith("/")?new URL(input,process.env.BASE_URL||"http://localhost:3002"):input,init);
const jobs=Object.entries(symbols).flatMap(([exchange,symbol])=>exchangeTimeframes(exchange).filter(tf=>wsInterval(exchange,tf)).map(timeframe=>({exchange,symbol,timeframe}))),results=[];
await Promise.all(jobs.map(({exchange,symbol,timeframe})=>new Promise(resolve=>{
  let stop=()=>{},done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);stop();results.push({exchange,timeframe,...result});console.log(result.ok?"PASS":"FAIL",exchange,timeframe);resolve();};
  const timer=setTimeout(()=>finish({ok:false,error:"No candle within 85 seconds"}),85000);
  stop=subscribeMarketStream(exchange,{symbol,timeframe,wsSymbol:"BTC/USDT",onStatus(){},onReconnect(){},onCandle(candle){finish({ok:true,time:candle.time});}});
})));
await mkdir(".qa",{recursive:true});await writeFile(".qa/all-interval-streams.json",JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));assert.ok(results.every(result=>result.ok),"Some intervals did not deliver stream data");
