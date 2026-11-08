import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const page=await browser.newPage();await page.goto(baseURL);
  const report=await page.evaluate(async()=>{
    const configs=[
      ["binance","wss://data-stream.binance.vision/ws/btcusdt@depth20@100ms",null],
      ["bybit","wss://stream.bybit.com/v5/public/spot",{op:"subscribe",args:["orderbook.50.BTCUSDT"]}],
      ["okx","wss://ws.okx.com:8443/ws/v5/public",{op:"subscribe",args:[{channel:"books5",instId:"BTC-USDT"}]}],
      ["gate","wss://api.gateio.ws/ws/v4/",{time:Math.floor(Date.now()/1000),channel:"spot.order_book",event:"subscribe",payload:["BTC_USDT","20","100ms"]}],
      ["htx","wss://api.huobi.pro/ws",{sub:"market.btcusdt.depth.step0",id:"check"}]
    ];
    try{const r=await fetch("/api/market/kucoin-token"),j=await r.json(),d=j.data;if(d?.token)configs.push(["kucoin",d.endpoint+"?"+new URLSearchParams({token:d.token,connectId:crypto.randomUUID()}),{id:"check",type:"subscribe",topic:"/spotMarket/level2Depth50:BTC-USDT",privateChannel:false,response:true}]);}catch{}
    return Promise.all(configs.map(([exchange,url,subscription])=>new Promise(resolve=>{
      let done=false;const ws=new WebSocket(url);ws.binaryType="arraybuffer";const timer=setTimeout(()=>finish({exchange,status:"no_depth_in_15s"}),15000);
      function finish(value){if(done)return;done=true;clearTimeout(timer);ws.close();resolve(value);}
      ws.onopen=()=>{if(subscription)ws.send(JSON.stringify(subscription));};
      ws.onmessage=async event=>{try{
        let raw=event.data;if(raw instanceof ArrayBuffer)raw=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).text();const j=JSON.parse(raw);
        if(j.ping){ws.send(JSON.stringify({pong:j.ping}));return;}
        const d=j.tick||j.result||(Array.isArray(j.data)?j.data[0]:j.data)||j;
        if(Array.isArray(d.bids)||Array.isArray(d.b))finish({exchange,status:"depth_received",bids:(d.bids||d.b).length,asks:(d.asks||d.a)?.length});
      }catch{}};
      ws.onerror=()=>finish({exchange,status:"socket_error"});
    })));
  });console.log(JSON.stringify(report));
  await page.getByRole("button",{name:"Показать стакан",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:/^Стакан /});
  await dialog.getByRole("status",{name:"WebSocket",exact:true}).waitFor({timeout:15000});
  assert.ok(await dialog.locator(".book-bids .book-row").count()>0);
  assert.ok(await dialog.locator(".book-asks .book-row").count()>0);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/orderbook-real-binance.png"});
  await dialog.getByRole("button",{name:"Закрыть стакан"}).click();
  console.log("PASS real Binance dialog received and rendered live order book");
}finally{await browser.close();}
