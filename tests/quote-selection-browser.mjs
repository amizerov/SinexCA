import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],subscriptions=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>{subscriptions.push(socket.url());socket.close();});
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",quote=url.searchParams.get("quote"),symbol=url.searchParams.get("symbol")||"SOLUSDT";
    const currencies=exchange==="bitget"?["USDT"]:exchange==="coinbase"?["USD","USDT","BTC"]:["USDT","USDC","BTC"];
    const catalog=currencies.map(quoteAsset=>({exchange,marketType:"spot",baseAsset:"SOL",quoteAsset,symbol:exchange==="coinbase"?`SOL-${quoteAsset}`:`SOL${quoteAsset}`}));
    const candles=Array.from({length:100},(_,i)=>({time:1794000000+i*3600,open:89,high:91,low:88,close:90,volume:2}));
    const data=url.pathname.endsWith("/pairs")?catalog:url.pathname.endsWith("/candles")?candles:url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:89,quantity:2}],asks:[{price:91,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:catalog.filter(p=>!quote||quote==="all"||p.quoteAsset===quote).map(p=>({exchange,symbol:p.symbol,lastPrice:90,priceChangePercent24h:1,quoteVolume24h:100,high24h:91,low24h:88,receivedAt:Date.now(),exchangeTime:null,bid:null,ask:null,bidSize:null,askSize:null}));
    return route.fulfill({json:{data}});
  });
  await page.goto(baseURL);
  const selector=page.getByRole("combobox",{name:"Валюта котировки",exact:true});
  await page.locator(".pair-row").first().waitFor();await page.locator(".asset-name h1").filter({hasText:"SOL/USDT"}).waitFor();
  await selector.selectOption("BTC");await page.locator(".asset-name h1").filter({hasText:"SOL/BTC"}).waitFor();
  await page.locator('.pair-list[aria-busy="false"]').waitFor();
  assert.equal(await page.locator(".pair-row").count(),1);
  await page.getByRole("button",{name:"Coinbase",exact:true}).click();await page.locator(".asset-name h1").filter({hasText:"SOL/BTC"}).waitFor();
  await selector.selectOption("USD");await page.locator(".asset-name h1").filter({hasText:"SOL/USD"}).waitFor();
  await selector.selectOption("all");await page.locator(".pair-row").nth(2).waitFor();
  await page.locator(".pair-row").filter({hasText:"SOL/USDT"}).click();await page.locator(".asset-name h1").filter({hasText:"SOL/USDT"}).waitFor();
  assert.equal(await selector.inputValue(),"all");
  const book=page.getByRole("dialog",{name:/^Стакан /});await book.getByRole("cell",{name:"89",exact:true}).waitFor();
  assert.ok((await book.locator(".orderbook-window-header").getAttribute("title")).includes("SOL/USDT"));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("sinex:workspace:guest")).settings);assert.equal(saved.quote,"all");assert.equal(saved.selectedQuote,"USDT");
  await page.reload();await page.locator(".asset-name h1").filter({hasText:"SOL/USDT"}).waitFor();assert.equal(await selector.inputValue(),"all");
  await page.getByRole("dialog",{name:/^Стакан /}).getByRole("button",{name:"Закрыть стакан"}).click();
  await selector.selectOption("BTC");await page.getByRole("button",{name:"Bitget",exact:true}).click();await page.locator(".asset-identity p").filter({hasText:"Bitget"}).waitFor();await page.locator(".asset-name h1").filter({hasText:"SOL/USDT"}).waitFor();assert.equal(await selector.inputValue(),"USDT");
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  assert.equal(await selector.isVisible(),true);assert.equal(await selector.isEnabled(),true);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/quote-selection-mobile.png"});
  assert.deepEqual(errors,[]);assert.ok(subscriptions.length>2);
  console.log("PASS quote filter, all-pair identity, exchange preservation/fallback, guest reload, orderbook and mobile bounds");
}finally{await browser.close();}
