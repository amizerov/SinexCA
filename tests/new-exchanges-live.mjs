import assert from "node:assert/strict";
import {writeFile,mkdir} from "node:fs/promises";
import {exchangeTimeframes} from "../lib/market/intervals.ts";
import {streamSettings,decodeForeignStream} from "../lib/market/stream.ts";
import {tradeFactories} from "../lib/market/trades/registry.ts";
import {bookProtocol} from "../lib/market/orderbook/protocols.ts";
const baseURL=process.env.BASE_URL||"http://localhost:3002",report=[];
async function get(path){const r=await fetch(baseURL+path,{signal:AbortSignal.timeout(45000)}),json=await r.json();assert.equal(r.status,200,`${path}: ${JSON.stringify(json)}`);return json.data;}
async function stream(exchange,pair){
  const options={symbol:pair.symbol,timeframe:"1h"},settings=streamSettings(exchange,options),trades=await tradeFactories[exchange]([pair],new AbortController().signal),book=await bookProtocol(pair,new AbortController().signal);
  const counts={candles:0,trades:0,books:0},failures=[];
  await Promise.all([
    {...settings,subscriptions:[settings.message],decode:input=>{if(decodeForeignStream(exchange,input,options).candle)counts.candles++;}},
    {...trades,decode:input=>{counts.trades+=trades.decode(input).filter(t=>Date.now()-t.time<60000).length;}},
    {...book,decode:input=>{const b=book.decode(input);if(b){assert.ok(b.bids.length&&b.asks.length);assert.ok(b.bids[0].price<b.asks[0].price);counts.books++;}}},
  ].map(protocol=>new Promise(resolve=>{
    const ws=new WebSocket(protocol.url);let ping,subscription;
    const timeout=setTimeout(()=>{clearInterval(ping);clearTimeout(subscription);ws.close();resolve();},30000);
    ws.onopen=()=>{subscription=setTimeout(()=>protocol.subscriptions.forEach(m=>ws.send(JSON.stringify(m))),protocol.subscribeDelayMs||0);if(protocol.ping)ping=setInterval(()=>ws.send(typeof protocol.ping==="string"?protocol.ping:JSON.stringify(protocol.ping)),5000);};
    ws.onmessage=e=>{try{const d=JSON.parse(String(e.data));if(d.error||typeof d.code==="number"&&d.code!==0)throw new Error(JSON.stringify(d));const reply=protocol.reply?.(d);if(reply)ws.send(JSON.stringify(reply));protocol.decode(d);}catch(error){failures.push(String(error));}};
    ws.onerror=()=>{failures.push("WebSocket transport error");clearTimeout(timeout);clearTimeout(subscription);clearInterval(ping);resolve();};
  })));
  assert.deepEqual(failures,[]);for(const [key,count]of Object.entries(counts))assert.ok(count>0,`${exchange}: no ${key}`);
  return counts;
}
for(const exchange of ["whitebit","cryptocom"]){
  const pairs=await get(`/api/market/pairs?exchange=${exchange}`),pair=pairs.find(p=>p.baseAsset==="BTC");assert.ok(pair&&pairs.length>20);assert.ok(pairs.every(p=>p.marketType==="spot"&&p.quoteAsset==="USDT"));
  const overview=await get(`/api/market/overview?exchange=${exchange}`);assert.ok(overview.length>20);
  const intervals={};for(const timeframe of exchangeTimeframes(exchange)){
    const data=await get(`/api/market/candles?exchange=${exchange}&symbol=${pair.symbol}&timeframe=${timeframe}&limit=3`);assert.ok(data.length>0&&data.length<=3,`${exchange}:${timeframe}: empty candles`);intervals[timeframe]=data.length;
  }
  const history=await get(`/api/market/candles?exchange=${exchange}&symbol=${pair.symbol}&timeframe=1h&limit=1000`);assert.equal(history.length,1000,`${exchange}: indicator warmup history`);
  const depth=await get(`/api/market/orderbook?exchange=${exchange}&symbol=${pair.symbol}`);assert.ok(depth.bids.length&&depth.asks.length);
  const streams=await stream(exchange,pair),item={exchange,pairs:pairs.length,tickers:overview.length,intervals,warmup:history.length,restBook:[depth.bids.length,depth.asks.length],streams};report.push(item);console.log("PASS",JSON.stringify(item));
}
await mkdir(".qa",{recursive:true});await writeFile(".qa/new-exchanges-live.json",JSON.stringify({checkedAt:new Date().toISOString(),report},null,2));
