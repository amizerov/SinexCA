import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  let release,loaded=new Promise(resolve=>{release=resolve;}),reverse=false;
  await context.route("**/api/market/**",async route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange");
    const pairs=["BTC","ETH","AAVE"].map(baseAsset=>({exchange,marketType:"spot",baseAsset,quoteAsset:"USDT",symbol:`${baseAsset}USDT`}));
    let data=[];
    if(url.pathname.endsWith("/pairs"))data=pairs;
    if(url.pathname.endsWith("/tickers")||url.pathname.endsWith("/overview")){
      await loaded;
      data=pairs.map((p,i)=>({exchange,symbol:p.symbol,lastPrice:100+i,priceChangePercent24h:i,quoteVolume24h:reverse?i*100:1000-i*100,bid:99,ask:101,bidSize:null,askSize:null,high24h:105,low24h:95,exchangeTime:Date.now(),receivedAt:Date.now()}));
    }
    if(url.pathname.endsWith("/candles"))data=Array.from({length:50},(_,i)=>({time:1700000000+i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));
    if(url.pathname.endsWith("/coin"))data={name:"Bitcoin",asset:"BTC",rank:1,description:"Описание проекта",descriptionLanguage:"ru",categories:["Layer 1"],contracts:[],links:[{label:"Сайт проекта",url:"https://bitcoin.org/"}],market:null,sourceUrl:"https://www.coingecko.com/en/coins/bitcoin",updatedAt:null};
    await route.fulfill({json:{data}});
  });
  await page.goto(process.env.BASE_URL||"http://localhost:3002");
  await page.waitForFunction(()=>document.querySelectorAll(".pair-skeleton").length===3);
  assert.equal(await page.locator(".pair-row:not(.pair-skeleton)").count(),0);
  assert.equal(await page.locator('.sort-select select').inputValue(),"volume");
  release();
  const names=()=>page.locator("button.pair-row .pair-name").allTextContents();
  await page.waitForFunction(()=>document.querySelectorAll("button.pair-row").length===3);
  assert.deepEqual(await names(),["BTC/USDT","ETH/USDT","AAVE/USDT"]);
  await page.locator("button.pair-row").filter({hasText:"ETH/USDT"}).click();
  const top=await page.locator("button.pair-row.active").evaluate(el=>el.getBoundingClientRect().top);
  reverse=true;
  await page.getByRole("button",{name:"Обновить",exact:true}).click();
  await page.waitForTimeout(500);
  assert.deepEqual(await names(),["BTC/USDT","ETH/USDT","AAVE/USDT"]);
  assert.equal(await page.locator("button.pair-row.active").evaluate(el=>el.getBoundingClientRect().top),top);
  await page.locator('.sort-select select').selectOption("name");
  assert.deepEqual(await names(),["AAVE/USDT","BTC/USDT","ETH/USDT"]);
  await page.locator("button.pair-row").filter({hasText:"BTC/USDT"}).click();
  await page.locator(".coin-name-trigger").click();
  await page.locator(".coin-info-description").waitFor();
  assert.equal(await page.locator(".coin-info-dialog").evaluate(el=>el.getBoundingClientRect().width),700);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".coin-info-dialog").count(),0);
  await page.locator('.sort-select select').selectOption("volume");
  await page.setViewportSize({width:375,height:700});
  loaded=new Promise(resolve=>{release=resolve;});
  await page.locator(".exchange-select").selectOption("bybit");
  await page.locator(".pair-skeleton").first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll(".pair-skeleton").length===3&&document.querySelector(".pair-skeleton")?.getBoundingClientRect().height>0);
  const skeletonHeight=await page.locator(".pair-skeleton").first().evaluate(el=>el.getBoundingClientRect().height);
  release();await page.waitForFunction(()=>document.querySelectorAll("button.pair-row").length===3);
  assert.equal(await page.locator("button.pair-row").first().evaluate(el=>el.getBoundingClientRect().height),skeletonHeight);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log("PASS skeleton waits for sorting data, selection stays in place across refresh, sorting works, mobile row sizes match, coin dialog opens and closes");
}finally{await browser.close();}
