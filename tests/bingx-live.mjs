import assert from "node:assert/strict";
import {bingxCandles,bingxPairs,bingxTickers} from "../lib/market/exchanges/bingx-normalize.ts";
import {bingxBook} from "../lib/market/orderbook/bingx.ts";
import {bookProtocol} from "../lib/market/orderbook/protocols.ts";
import {decodeForeignStream,streamSettings} from "../lib/market/stream.ts";
import {tradeFactories} from "../lib/market/trades/registry.ts";

async function json(path){const response=await fetch(`https://open-api.bingx.com${path}`,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,`${path}: ${response.status}`);return response.json();}
const pairs=bingxPairs(await json("/openApi/spot/v1/common/symbols"),null),pair=pairs.find(value=>value.symbol==="BTC-USDT");
assert.ok(pair&&pairs.length>20);assert.ok(pairs.every(value=>value.marketType==="spot"));
const overview=bingxTickers(await json("/openApi/spot/v1/ticker/24hr"));assert.ok(overview.some(value=>value.symbol===pair.symbol));
const candles=bingxCandles(await json(`/openApi/spot/v2/market/kline?symbol=${pair.symbol}&interval=1h&limit=500`));assert.ok(candles.length>100);
const adapter=bingxBook(pair.symbol),depth=adapter.decode(await json(`${adapter.url.pathname}${adapter.url.search}`));assert.ok(depth.bids.length&&depth.asks.length);
const tradeProtocol=await tradeFactories.bingx([pair],new AbortController().signal),depthProtocol=await bookProtocol(pair,new AbortController().signal),candleProtocol=streamSettings("bingx",{symbol:pair.symbol,timeframe:"1h"});
async function live(label,protocol,decode){return new Promise((resolve,reject)=>{const socket=new WebSocket(protocol.url);socket.binaryType="arraybuffer";let seen="";const timer=setTimeout(()=>{socket.close();reject(new Error(`BingX ${label} WebSocket timeout; last=${seen}`));},20000);socket.onopen=()=>protocol.subscriptions.forEach(value=>socket.send(JSON.stringify(value)));socket.onmessage=async event=>{try{const text=event.data instanceof ArrayBuffer?await new Response(new Blob([event.data]).stream().pipeThrough(new DecompressionStream("gzip"))).text():String(event.data),input=JSON.parse(text),reply=protocol.reply?.(input);seen=text.slice(0,240);if(reply)socket.send(JSON.stringify(reply));if(decode(input)){clearTimeout(timer);socket.close();resolve();}}catch(error){clearTimeout(timer);socket.close();reject(error);}};socket.onerror=()=>{clearTimeout(timer);reject(new Error(`BingX ${label} WebSocket error`));};});}
await Promise.all([
  live("trades",tradeProtocol,input=>tradeProtocol.decode(input).length>0),
  live("depth",depthProtocol,input=>!!depthProtocol.decode(input)),
  live("candles",{url:candleProtocol.url,subscriptions:[candleProtocol.message],reply:candleProtocol.reply},input=>!!decodeForeignStream("bingx",input,{symbol:pair.symbol,timeframe:"1h"}).candle),
]);
console.log("PASS",JSON.stringify({pairs:pairs.length,tickers:overview.length,candles:candles.length,book:[depth.bids.length,depth.asks.length],streams:true}));
