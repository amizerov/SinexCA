import assert from "node:assert/strict";
import {writeFile,mkdir} from "node:fs/promises";
import {EXCHANGE_IDS,EXCHANGES} from "../lib/market/exchange-config.ts";
const baseURL=process.env.BASE_URL||"http://localhost:3002",report=[];
async function get(path){const response=await fetch(baseURL+path,{signal:AbortSignal.timeout(30000)}),json=await response.json();assert.equal(response.status,200,`${path}: ${JSON.stringify(json)}`);return json.data;}
for(const exchange of EXCHANGE_IDS){
  const all=await get(`/api/market/pairs?exchange=${exchange}&quote=all`),currencies=[...new Set(all.map(p=>p.quoteAsset))];assert.ok(all.length);
  const pair=all.find(p=>p.baseAsset==="BTC"&&p.quoteAsset!==EXCHANGES[exchange].quote)||all.find(p=>p.quoteAsset!==EXCHANGES[exchange].quote)||all[0];
  const filtered=await get(`/api/market/pairs?exchange=${exchange}&quote=${pair.quoteAsset}`);assert.ok(filtered.length&&filtered.every(p=>p.quoteAsset===pair.quoteAsset));
  const overview=await get(`/api/market/overview?exchange=${exchange}&quote=${pair.quoteAsset}`),symbols=new Set(filtered.map(p=>p.symbol));assert.ok(overview.length&&overview.every(t=>symbols.has(t.symbol)));
  const symbol=encodeURIComponent(pair.symbol),tickers=await get(`/api/market/tickers?exchange=${exchange}&symbols=${symbol}`);assert.equal(tickers[0]?.symbol,pair.symbol);
  const candles=await get(`/api/market/candles?exchange=${exchange}&symbol=${symbol}&timeframe=1h&limit=3`);assert.ok(candles.length);
  const book=await get(`/api/market/orderbook?exchange=${exchange}&symbol=${symbol}`);assert.ok(book.bids.length&&book.asks.length);
  const row={exchange,pairs:all.length,currencies,tested:pair.symbol};report.push(row);console.log("PASS",JSON.stringify(row));
}
await mkdir(".qa",{recursive:true});await writeFile(".qa/quote-selection-live.json",JSON.stringify({checkedAt:new Date().toISOString(),report},null,2));
