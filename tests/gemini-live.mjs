import assert from "node:assert/strict";
import {geminiCandles,geminiOverview,geminiPairs,geminiTicker} from "../lib/market/exchanges/gemini-normalize.ts";
import {geminiBook} from "../lib/market/orderbook/gemini.ts";
import {bookProtocol} from "../lib/market/orderbook/protocols.ts";
import {tradeFactories} from "../lib/market/trades/registry.ts";

async function json(path){
  const response=await fetch(`https://api.gemini.com${path}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,`${path}: ${response.status}`);
  return response.json();
}

const pairs=geminiPairs(await json("/v1/symbols"),null),pair=pairs.find(value=>value.symbol==="btcusd");
assert.ok(pair&&pairs.length>20);assert.ok(pairs.every(value=>value.marketType==="spot"));
const overview=geminiOverview(await json("/v1/pricefeed"));assert.ok(overview.some(value=>value.symbol===pair.symbol));
const ticker=geminiTicker(await json(`/v2/ticker/${pair.symbol}`));assert.equal(ticker[0]?.symbol,pair.symbol);
const candles=geminiCandles(await json(`/v2/candles/${pair.symbol}/1h`));assert.ok(candles.length>=500);
const restAdapter=geminiBook(pair.symbol),restBook=restAdapter.decode(await json(`${restAdapter.url.pathname}${restAdapter.url.search}`));
assert.ok(Array.isArray(restBook.bids)&&restBook.bids.length&&Array.isArray(restBook.asks)&&restBook.asks.length);

const trades=await tradeFactories.gemini([pair],new AbortController().signal),depth=await bookProtocol(pair,new AbortController().signal);
const counts={trades:0,books:0};
await Promise.all([[trades,"trades"],[depth,"books"]].map(([protocol,key])=>new Promise((resolve,reject)=>{
  const socket=new WebSocket(protocol.url),timeout=setTimeout(()=>{socket.close();reject(new Error(`Gemini ${key} stream timeout`));},20000);
  socket.onopen=()=>protocol.subscriptions.forEach(message=>socket.send(JSON.stringify(message)));
  socket.onmessage=event=>{try{const input=JSON.parse(String(event.data));if(key==="trades")counts.trades+=protocol.decode(input).length;else if(protocol.decode(input))counts.books++;if(counts[key]>0){clearTimeout(timeout);socket.close();resolve();}}catch(error){clearTimeout(timeout);socket.close();reject(error);}};
  socket.onerror=()=>{clearTimeout(timeout);reject(new Error(`Gemini ${key} WebSocket error`));};
})));

console.log("PASS",JSON.stringify({pairs:pairs.length,tickers:overview.length,candles:candles.length,restBook:[restBook.bids.length,restBook.asks.length],streams:counts}));
