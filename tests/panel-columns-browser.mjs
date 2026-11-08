import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",message=>{if(message.type()==="error"&&/same key|disposed/i.test(message.text()))errors.push(message.text());});
  const owner="dock-layout-test";await context.route("**/api/auth/session",route=>route.fulfill({json:{data:{ownerId:owner,user:null,googleAvailable:false}}}));
  await context.route("**/api/paper/orders",route=>route.fulfill({json:{ownerId:owner,orders:[{id:"mine",exchange:"binance",symbol:"BTCUSDT",side:"buy"}],fills:[{id:"a",orderId:"mine",exchange:"binance",symbol:"BTCUSDT",side:"buy",quantity:25000000,price:77,receivedAt:Date.now()},{id:"b",orderId:"other",exchange:"okx",symbol:"BTCUSDT",side:"sell",quantity:1e8,price:999,receivedAt:Date.now()},{id:"c",orderId:"other",exchange:"binance",symbol:"ETHUSDT",side:"sell",quantity:1e8,price:888,receivedAt:Date.now()}],account:{balances:[]},health:{checkedAt:Date.now(),errors:[]}}}));
  await context.route("**/api/market/**",route=>{const u=new URL(route.request().url()),exchange=u.searchParams.get("exchange")||"binance",pairs=["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:baseAsset+"USDT",baseAsset,quoteAsset:"USDT"}));const data=u.pathname.endsWith("/pairs")?pairs:u.pathname.endsWith("/orderbook")?{exchange,symbol:u.searchParams.get("symbol"),bids:[{price:99,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:u.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:Math.floor(Date.now()/3600000)*3600-(99-i)*3600,open:100,high:105,low:95,close:100,volume:2})):pairs.map(p=>({exchange,symbol:p.symbol,lastPrice:100,high24h:105,low24h:95,priceChangePercent24h:0,quoteVolume24h:10000,receivedAt:Date.now()}));return route.fulfill({json:{data}});});
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await page.goto(base);
  await page.getByRole("button",{name:"Показать сделки",exact:true}).click();
  const panel=page.locator('[data-dock-panel="trades"]'),markets=page.locator('[data-dock-panel="markets"]');
  await panel.getByRole("button",{name:"Закрепить сделки",exact:true}).click();await page.locator(".column-stacked").waitFor();
  async function dragTo(x,y){const h=await panel.locator("header").boundingBox();await page.mouse.move(h.x+40,h.y+14);await page.mouse.down();await page.mouse.move(x,y,{steps:10});}
  let m=await markets.boundingBox();await dragTo(m.x+10,m.y+m.height/2);await page.getByRole("status").filter({hasText:"Закрепить рядом слева"}).waitFor();await page.mouse.up();await page.locator(".column-parallel").waitFor();
  m=await markets.boundingBox();let t=await panel.boundingBox();assert.equal(m.y,t.y);assert.equal(m.height,t.height);assert.ok(t.x+t.width<=m.x);assert.ok(t.height>700);
  await page.getByRole("separator",{name:"Ширина рынков и сделок",exact:true}).focus();await page.keyboard.press("ArrowRight");assert.ok((await panel.boundingBox()).width>t.width);
  await page.reload();await page.locator(".column-parallel").waitFor();m=await markets.boundingBox();assert.ok((await panel.boundingBox()).x<m.x);
  await dragTo(m.x+m.width-10,m.y+m.height/2);await page.getByRole("status").filter({hasText:"Закрепить рядом справа"}).waitFor();await page.mouse.up();m=await markets.boundingBox();t=await panel.boundingBox();assert.ok(m.x+m.width<=t.x);assert.equal(m.height,t.height);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/parallel-markets-trades.png"});
  await dragTo(m.x+m.width/2,m.y+40);await page.getByRole("status").filter({hasText:"Закрепить сверху"}).waitFor();await page.mouse.up();await page.locator(".column-stacked").waitFor();m=await markets.boundingBox();t=await panel.boundingBox();assert.ok(t.y+t.height<=m.y);assert.equal(m.x,t.x);
  assert.deepEqual(errors,[]);console.log("PASS: dock side by side in both orders, full height, resize, restore after reload, return to vertical stacking");await context.close();
}finally{await browser.close();}
