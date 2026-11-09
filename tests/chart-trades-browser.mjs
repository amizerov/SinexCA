import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error"&&/disposed|same key/i.test(m.text()))errors.push(m.text());});
  await context.routeWebSocket(/wss:\/\//,s=>s.close());
  const session=(await(await context.request.get(`${base}/api/auth/session`)).json()).data,owner=session.ownerId,now=Date.now(),minute=Math.floor(now/60000)*60000;
  const f=(id,side,price,quantity,time,orderId="buy")=>({id,orderId,exchange:"binance",symbol:"BTCUSDT",base:"BTC",quote:"USDT",side,price,quantity,quoteUnits:price*quantity/100,feeUnits:100000,receivedAt:time,exchangeTime:null});
  const fills=[f("one","buy",100,1e8,minute-120000+10000),f("two","buy",102,3e8,minute-120000+20000),f("sale","sell",104,1e8,minute-60000+20000,"sell")];
  const position={key:"binance:BTC:USDT",exchange:"binance",symbol:"BTCUSDT",base:"BTC",quote:"USDT",marketQuote:"USDT",quantity:3,cost:304.8,average:101.6,available:3,realized:2};
  await context.route("**/api/paper/orders",r=>r.fulfill({json:{ownerId:owner,orders:[],fills,account:{balances:[],portfolio:{positions:[position]}},health:{errors:[],checkedAt:now}}}));
  await context.route("**/api/paper/chart-trades?*",r=>{const u=new URL(r.request().url());return r.fulfill({json:{ownerId:owner,fills:u.searchParams.get("exchange")==="binance"&&u.searchParams.get("symbol")==="BTCUSDT"?fills:[],truncated:false}});});
  await context.route("**/api/market/**",r=>{const u=new URL(r.request().url()),exchange=u.searchParams.get("exchange")||"binance",pairs=["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:baseAsset+"USDT",baseAsset,quoteAsset:"USDT"})),tf=u.searchParams.get("timeframe")||"1h",step=tf==="1m"?60:3600,end=Math.floor(now/1000/step)*step;
    const data=u.pathname.endsWith("/pairs")?pairs:u.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:end-(99-i)*step,open:100,high:110,low:95,close:105,volume:10})):pairs.map(p=>({exchange,symbol:p.symbol,lastPrice:105,high24h:110,low24h:95,priceChangePercent24h:5,quoteVolume24h:10000,receivedAt:Date.now()}));return r.fulfill({json:{data}});});
  await page.goto(base);await page.locator('[data-execution-count="2"]').waitFor();await page.locator("[data-entry-price]").waitFor();assert.ok(Math.abs(Number(await page.locator("[data-entry-price]").getAttribute("data-entry-price"))-101.6)<1e-8);assert.ok((await page.locator("[data-execution-count]").innerText()).includes("4 BTC"));assert.ok((await page.locator(".chart-entry-summary").innerText()).includes("+"));await page.getByRole("button",{name:"Показать всю историю",exact:true}).click();await page.waitForTimeout(250);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/chart-executions-layout.png"});
  // Hit the rendered native marker, not a test-only DOM replacement.
  const box=await page.locator(".chart-canvas").boundingBox();let found=false;
  for(let x=box.x+box.width-105;x>box.x+box.width-180&&!found;x-=5){for(let y=box.y+box.height*.06;y<box.y+box.height*.22&&!found;y+=6){await page.mouse.move(x,y);found=await page.getByRole("tooltip").isVisible();}}
  assert.ok(found,"A native execution marker exposes a tooltip on hover");assert.ok((await page.getByRole("tooltip").innerText()).includes("Комиссия"));await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/chart-executions.png"});
  await page.getByRole("button",{name:"Показать или скрыть мои сделки",exact:true}).click();assert.equal(await page.locator("[data-execution-count]").getAttribute("data-execution-count"),"0");assert.equal(await page.locator(".chart-entry-summary").count(),0);await page.getByRole("button",{name:"Показать или скрыть мои сделки",exact:true}).click();await page.locator('[data-execution-count="2"]').waitFor();
  for(const name of ["Bybit","Binance","Bybit","Binance"]){await page.locator(".exchange-tabs button").filter({hasText:new RegExp(`^${name}$`)}).click();await page.locator("[data-execution-count]").filter({hasText:name==="Bybit"?"":"Покупка"}).waitFor();await page.waitForTimeout(150);if(name==="Bybit"){assert.equal(await page.locator("[data-execution-count]").getAttribute("data-execution-count"),"0");assert.equal(await page.locator(".chart-entry-summary").count(),0);}else await page.locator('[data-execution-count="2"]').waitFor();}
  await page.getByRole("button",{name:"1m",exact:true}).click();await page.locator('[data-execution-count="2"]').waitFor();await page.setViewportSize({width:375,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log("PASS: grouped exact execution markers, native hover tooltip, cost/fee basis, hide/show, venue and interval switches without disposed errors, mobile bounds");await context.close();
}finally{await browser.close();}
