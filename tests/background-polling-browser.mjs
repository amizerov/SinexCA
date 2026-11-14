import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const base=process.env.BASE_URL||"http://127.0.0.1:3017",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),calls=[],errors=[];
  await context.addInitScript(()=>{
    window.__testHidden=false;
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>window.__testHidden});
    Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__testHidden?"hidden":"visible"});
  });
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",asset=exchange==="gate"?"BNB":exchange==="whitebit"?"SOL":"BTC",symbol=exchange==="gate"||exchange==="whitebit"?`${asset}_USDT`:`${asset}USDT`;
    const data=url.pathname.endsWith("/pairs")?[{exchange,marketType:"spot",symbol,baseAsset:asset,quoteAsset:"USDT"}]:url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:1700000000+i*3600,open:100,high:102,low:99,close:101,volume:10})):url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[];
    return route.fulfill({json:{data}});
  });
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await context.request.get(`${base}/api/auth/session`);
  const monitored=url=>["/api/paper/orders","/api/paper/chart-trades","/api/market/tickers","/api/market/overview"].includes(new URL(url).pathname);
  page.on("request",r=>{if(monitored(r.url()))calls.push(r.url());});
  await page.goto(base);await page.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();
  await page.getByRole("button",{name:"Gate",exact:true}).click();await page.locator('.chart-canvas[aria-label*="BNB_USDT"]').waitFor();
  await page.waitForTimeout(6000);
  assert.ok(calls.some(url=>url.includes("chart-trades?exchange=gate")));assert.ok(calls.filter(url=>url.includes("/api/paper/orders")).length>=2);
  await page.evaluate(()=>{window.__testHidden=true;document.dispatchEvent(new Event("visibilitychange"));});
  await page.waitForTimeout(200);const hiddenCount=calls.length;await page.waitForTimeout(6500);
  assert.equal(calls.length,hiddenCount,"Hidden tab must stop DEMO and ticker polling");
  const resumed=Promise.all([page.waitForRequest(r=>r.url().includes("/api/paper/orders")),page.waitForRequest(r=>r.url().includes("chart-trades?exchange=gate")),page.waitForRequest(r=>r.url().includes("/api/market/tickers?exchange=gate"))]);
  await page.evaluate(()=>{window.__testHidden=false;document.dispatchEvent(new Event("visibilitychange"));});await resumed;
  await page.getByRole("button",{name:"WhiteBIT",exact:true}).click();await page.locator('.chart-canvas[aria-label*="SOL_USDT"]').waitFor();await page.waitForTimeout(200);
  const gateCount=calls.filter(url=>url.includes("exchange=gate")).length;await page.waitForTimeout(5500);
  assert.equal(calls.filter(url=>url.includes("exchange=gate")).length,gateCount,"Previous exchange must not continue polling");
  assert.ok(calls.some(url=>url.includes("chart-trades?exchange=whitebit")));assert.deepEqual(errors,[]);
  console.log("PASS polling: visible requests, hidden pause, immediate resume, no Gate requests after switching to WhiteBIT, no runtime errors");
}finally{await browser.close();}
