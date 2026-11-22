import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:3000",browser=await chromium.launch({channel:"chrome",headless:true});
async function setup(fail=false){
  const context=await browser.newContext({viewport:{width:1500,height:1000}});let attempts=0;
  await context.addInitScript(()=>localStorage.setItem("sinex:market-workspace:v1",JSON.stringify({exchange:"binance",marketType:"futures"})));
  await context.routeWebSocket(/wss:\/\/.*/,socket=>{attempts++;if(fail)socket.close({code:1011,reason:"Connection test"});});
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),now=Date.now(),marketType=url.searchParams.get("marketType")??"spot";
    const pairs=["BTC","ETH"].map(asset=>({exchange:"binance",marketType,symbol:`${asset}USDT`,baseAsset:asset,quoteAsset:"USDT",contractSize:1,priceIncrement:.1,futuresInfo:{kind:"perpetual",maxLeverage:20,minQuantity:.001,quantityStep:.001,fundingIntervalHours:8}}));
    const ticker=pair=>({exchange:"binance",symbol:pair.symbol,lastPrice:100,priceChangePercent24h:1,quoteVolume24h:100000,baseVolume24h:1000,bid:99,ask:101,bidSize:1,askSize:1,high24h:110,low24h:90,exchangeTime:now,receivedAt:now});
    let data;if(url.pathname.endsWith("/pairs"))data=pairs;else if(url.pathname.endsWith("/candles")){const end=Math.floor(now/3600000)*3600;data=Array.from({length:500},(_,i)=>({time:end-(499-i)*3600,open:100,high:103,low:99,close:102,volume:1}));}else if(url.pathname.endsWith("/overview")||url.pathname.endsWith("/tickers"))data=pairs.map(ticker);else if(url.pathname.endsWith("/orderbook"))data={exchange:"binance",symbol:url.searchParams.get("symbol"),bids:[{price:99,quantity:1}],asks:[{price:101,quantity:1}],receivedAt:now,exchangeTime:now};else return route.continue();
    return route.fulfill({json:{data,meta:{exchange:"binance",marketType,fetchedAt:new Date(now).toISOString()}}});
  });
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));await page.goto(base);
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor();
  return {context,page,errors,attempts:()=>attempts};
}
try{
  const {context,page,errors}=await setup();
  const trigger=page.getByRole("button",{name:"Параметры фьючерса",exact:true});
  assert.equal(await page.locator(".timeframe-toolbar").getByRole("button",{name:"Обновить",exact:true}).count(),0);
  await trigger.click();const dialog=page.getByRole("dialog",{name:"Параметры фьючерса",exact:true});
  await dialog.getByLabel("Плечо, ×",{exact:true}).fill("5");await dialog.getByLabel("Режим маржи",{exact:true}).selectOption("cross");await dialog.getByLabel("Количество, BTC",{exact:true}).fill("0.003");await dialog.getByRole("button",{name:"Сохранить",exact:true}).click();
  await trigger.click();assert.equal(await dialog.getByLabel("Плечо, ×",{exact:true}).inputValue(),"5");assert.equal(await dialog.getByLabel("Режим маржи",{exact:true}).inputValue(),"cross");await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
  await page.locator("button.pair-select").filter({hasText:"ETH/USDT"}).click();await trigger.click();assert.equal(await dialog.getByLabel("Плечо, ×",{exact:true}).inputValue(),"1");await page.keyboard.press("Escape");
  await page.reload();await trigger.click();await page.setViewportSize({width:390,height:844});
  assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/futures-parameters-mobile.png"});await page.keyboard.press("Escape");
  await page.getByRole("group",{name:"Тип рынка",exact:true}).getByRole("button",{name:"Спот",exact:true}).click();assert.equal(await trigger.count(),0);assert.equal(await page.locator(".timeframe-toolbar").getByRole("button",{name:"Обновить",exact:true}).count(),0);assert.deepEqual(errors,[]);await context.close();
  const failed=await setup(true),issue=failed.page.getByRole("dialog",{name:"Ошибка подключения к WebSocket",exact:true});await issue.waitFor({timeout:20000});
  assert.equal(await failed.page.locator(".timeframe-toolbar").getByRole("button",{name:"Обновить",exact:true}).count(),0);
  const before=failed.attempts();await issue.getByRole("button",{name:"Обновить",exact:true}).click();await issue.waitFor({state:"hidden"});await failed.page.waitForTimeout(300);assert(failed.attempts()>before,"Refresh restarts WebSocket connections");assert.deepEqual(failed.errors,[]);await failed.context.close();
  console.log("Futures parameters: saved per contract, mobile, spot visibility and WebSocket retry passed");
}finally{await browser.close();}
