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
  await page.locator('.instrument-info-button').click();
  const info=page.locator('.contract-info-dialog');await info.waitFor();assert.equal(await info.locator('input,select').count(),0);await page.keyboard.press('Escape');
  await page.locator('.timeframe-toolbar').getByRole('button',{name:'Новая заявка',exact:true}).click();
  const form=page.locator('.new-order-dialog');await form.waitFor();
  assert.equal(await form.locator('select').first().locator('option').count(),2);
  await form.getByLabel('Лимитная цена, USDT',{exact:true}).fill('100');await form.getByLabel('Количество, BTC',{exact:true}).fill('2');await form.getByLabel('Плечо, ×',{exact:true}).fill('5');
  await form.locator('.order-risk summary').click();await form.getByLabel('Stop Loss, USDT',{exact:true}).fill('90');await form.getByLabel('Take Profit, USDT',{exact:true}).fill('120');
  assert.match(await form.locator('[data-order-notional]').innerText(),/200/);assert.match(await form.locator('[data-order-margin]').innerText(),/40/);assert.match(await form.locator('[data-order-risk]').innerText(),/20/);assert.match(await form.locator('[data-order-reward]').innerText(),/40/);
  assert.equal(await form.locator('button[type=submit]').isDisabled(),true);
  const left=await form.locator('.order-input-column').boundingBox(),right=await form.locator('.order-analysis-column').boundingBox();assert(right.x>left.x+left.width,'Desktop uses two columns');
  await mkdir('.qa',{recursive:true});await page.screenshot({path:'.qa/order-two-columns-desktop.png'});
  await page.locator('button.pair-select').filter({hasText:'ETH/USDT'}).dispatchEvent('click');assert.match(await form.locator('h2').innerText(),/BTC/);assert.equal(await form.getByLabel('Количество, BTC',{exact:true}).inputValue(),'2');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await form.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);const mobileLeft=await form.locator('.order-input-column').boundingBox(),mobileRight=await form.locator('.order-analysis-column').boundingBox();assert(Math.abs(mobileLeft.x-mobileRight.x)<2,'Mobile uses one column');await page.screenshot({path:'.qa/order-two-columns-mobile.png'});
  await page.keyboard.press('Escape');assert.deepEqual(errors,[]);await context.close();
  console.log('Order form: contract info, calculations, captured instrument, desktop columns and mobile passed');
}finally{await browser.close();}
