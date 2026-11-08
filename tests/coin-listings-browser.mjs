import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  const exchanges=["binance","bybit","okx","bitget","gate","kraken","coinbase","kucoin","bitfinex","htx","mexc"];
  const pair={exchange:"binance",marketType:"spot",baseAsset:"CRV",quoteAsset:"USDT",symbol:"CRVUSDT"};
  await page.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await page.route("**/api/market/**",async route=>{
    const path=new URL(route.request().url()).pathname;let data=[];
    if(path.endsWith("/pairs"))data=[pair];
    if(path.endsWith("/listings"))data={listings:exchanges.map(exchange=>({exchange,pair:{...pair,exchange,quoteAsset:exchange==="coinbase"?"USD":"USDT"},url:`https://example.com/${exchange}/CRV`})),unavailable:[],checkedAt:new Date().toISOString()};
    if(path.endsWith("/coin"))data={name:"Curve DAO",asset:"CRV",description:"A long project description. ".repeat(1000),descriptionLanguage:"en",categories:[],contracts:[],links:[],market:null,sourceUrl:"https://www.coingecko.com/en/coins/curve-dao-token"};
    await route.fulfill({json:{data}});
  });
  await page.goto(process.env.BASE_URL||"http://localhost:3002");await page.locator(".coin-name-trigger").click();
  await page.waitForFunction(()=>document.querySelectorAll(".coin-listings-links a").length===11);
  await page.locator(".coin-info-description").waitFor();
  assert.equal(await page.locator(".coin-listings-links a").filter({hasText:"Coinbase"}).getAttribute("title"),"Coinbase · CRV/USD");
  for(const [width,height] of [[1440,900],[375,700],[320,568],[568,320]]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(async()=>{
      const body=document.querySelector(".coin-info-body"),list=document.querySelector(".coin-listings"),dialog=document.querySelector(".coin-info-dialog");
      const top=list.getBoundingClientRect().top;body.scrollTop=500;await new Promise(requestAnimationFrame);
      return {fixed:top===list.getBoundingClientRect().top,scroll:body.scrollTop,bodyHeight:body.clientHeight,outerOverflow:dialog.scrollHeight-dialog.clientHeight,bottom:dialog.getBoundingClientRect().bottom};
    });
    assert.ok(layout.fixed);assert.ok(layout.scroll>0);assert.ok(layout.bodyHeight>0,JSON.stringify({width,height,layout}));assert.ok(layout.outerOverflow<=1,JSON.stringify({width,height,layout}));assert.ok(layout.bottom<=height);
  }
  assert.deepEqual(errors,[]);console.log("PASS all exchange links stay fixed while project details scroll on desktop, mobile and short landscape");
}finally{await browser.close();}
