import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],requests=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",async route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange"),quote=exchange==="coinbase"?"USD":"USDT";
    const pairs=(exchange==="htx"?["BTC"]:["BTC","ETH"]).map(baseAsset=>({exchange,marketType:"spot",baseAsset,quoteAsset:quote,symbol:exchange==="coinbase"?`${baseAsset}-USD`:`${baseAsset}USDT`}));
    let data=[];
    if(url.pathname.endsWith("/pairs"))data=pairs;
    if(url.pathname.endsWith("/candles")){
      requests.push(Object.fromEntries(url.searchParams));
      data=Array.from({length:50},(_,i)=>({time:1700000000+i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));
    }
    await route.fulfill({json:{data}});
  });
  const change=async(exchange,pair,interval)=>{
    if(await page.locator(".exchange-select").isVisible())await page.locator(".exchange-select").selectOption(exchange);
    else await page.locator(".exchange-tabs button").filter({hasText:new RegExp(`^${exchange}$`,"i")}).click();
    await page.waitForFunction(({pair,interval})=>document.querySelector(".asset-name h1")?.textContent===pair&&document.querySelector(".timeframe-select")?.value===interval,{pair,interval});
    await page.locator(".pair-row.active").waitFor();
  };
  await page.goto(process.env.BASE_URL||"http://localhost:3002");
  await page.locator(".pair-row").filter({hasText:"ETH/USDT"}).click();
  await page.getByRole("button",{name:"3m",exact:true}).click();
  await change("bybit","ETH/USDT","3m");
  await change("coinbase","ETH/USD","5m");
  await change("binance","ETH/USDT","5m");
  await page.getByRole("button",{name:"1s",exact:true}).click();
  await change("bybit","ETH/USDT","1m");
  await change("htx","BTC/USDT","1m");
  await change("binance","BTC/USDT","1m");
  await page.setViewportSize({width:375,height:700});
  await page.locator(".timeframe-select").selectOption("3m");
  await change("coinbase","BTC/USD","5m");
  await change("bybit","BTC/USDT","5m");
  assert.ok(requests.some(r=>r.exchange==="coinbase"&&r.symbol==="ETH-USD"&&r.timeframe==="5m"));
  assert.equal(requests.some(r=>r.exchange==="coinbase"&&["3m","1s"].includes(r.timeframe)),false);
  assert.deepEqual(errors,[]);
  console.log("PASS pair and interval carry, nearest interval, native symbols, unavailable pair fallback and mobile exchange selector");
}finally{await browser.close();}
