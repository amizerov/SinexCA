import { subscribeTrades } from "../lib/market/trades/stream.ts";
import { EXCHANGE_IDS } from "../lib/market/exchange-config.ts";
import { mkdir,writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const baseURL=process.env.BASE_URL||"http://localhost:3002",originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>originalFetch(typeof input==="string"&&input.startsWith("/")?new URL(input,baseURL):input,init);
const targets=process.argv.length>2?process.argv.slice(2):EXCHANGE_IDS;
const results=await Promise.all(targets.map(async exchange=>{
  const response=await fetch(`${baseURL}/api/market/pairs?exchange=${exchange}`),json=await response.json();assert.equal(response.status,200);const pairs=json.data,btc=pairs.find(pair=>pair.baseAsset==="BTC")?.symbol;
  return new Promise(resolve=>{let stop=()=>{},batches=0,trades=0,firstAt=0,lastAt=0,done=false;const symbols=new Set(),statuses=[];
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);stop();const result={exchange,pairs:pairs.length,btcReceived:symbols.has(btc),symbols:[...symbols],batches,trades,durationMs:lastAt-firstAt,statuses,ok:symbols.has(btc)&&batches>=3};console.log(result.ok?"PASS":"FAIL",JSON.stringify(result));resolve(result);};
    const timer=setTimeout(finish,60000);stop=subscribeTrades(exchange,pairs,{onStatus:status=>statuses.push(status),onTicks:ticks=>{batches++;trades+=ticks.length;if(!firstAt)firstAt=Date.now();lastAt=Date.now();for(const tick of ticks)symbols.add(tick.symbol);if(batches>=15&&symbols.has(btc))finish();}});
  });
}));
await mkdir(".qa",{recursive:true});await writeFile(".qa/trade-streams.json",JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));assert.ok(results.every(result=>result.ok),"Some trade streams failed");
