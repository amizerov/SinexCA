import assert from "node:assert/strict";
import {tradeFactories} from "../lib/market/trades/registry.ts";
for(const [exchange,symbol,quoteAsset]of [["binance","BTCUSDT","USDT"],["coinbase","BTC-USD","USD"]]){
  const controller=new AbortController(),protocol=await tradeFactories[exchange]([{exchange,marketType:"spot",symbol,baseAsset:"BTC",quoteAsset}],controller.signal);
  await new Promise((resolve,reject)=>{const ws=new WebSocket(protocol.url);let finished=false;
    const finish=e=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();controller.abort();if(e)reject(e);else resolve();};
    const timer=setTimeout(()=>finish(new Error(`${exchange}: no complete trade within 20s`)),20000);
    ws.onopen=()=>{for(const request of protocol.subscriptions)ws.send(JSON.stringify(request));};
    ws.onerror=event=>finish(new Error(`${exchange}: ${event.message||"WebSocket connection failed"}`));
    ws.onmessage=event=>{try{const input=JSON.parse(String(event.data)),tick=protocol.decode(input).find(t=>t.symbol===symbol&&t.quantity>0&&t.side&&Date.now()-t.time<60000);if(tick){assert.ok(tick.id);assert.ok(tick.price>0);console.log(`PASS ${exchange}: real execution ID, price, quantity, side and exchange time received`);finish();}}catch(e){finish(e);}};
  });
}
