import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],queries=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",async route=>{
    const url=new URL(route.request().url());let data=[];
    if(url.pathname.endsWith("/pairs"))data=[{exchange:"binance",marketType:"spot",symbol:"HYPEUSDT",baseAsset:"HYPE",quoteAsset:"USDT"}];
    if(url.pathname.endsWith("/coin")){
      queries.push(Object.fromEntries(url.searchParams));
      if(!url.searchParams.has("id")){await route.fulfill({json:{candidates:[{id:"wrong-hype",name:"Another HYPE",symbol:"HYPE",provider:"coingecko"},{id:"hyperliquid",name:"Hyperliquid",symbol:"HYPE",provider:"coingecko"}]}});return;}
      assert.equal(url.searchParams.get("id"),"hyperliquid");
      data={id:"hyperliquid",name:"Hyperliquid",asset:"HYPE",rank:1,description:"A verified project description.",descriptionLanguage:"en",categories:[],contracts:[],links:[],market:null,sourceName:"CoinGecko",sourceUrl:"https://www.coingecko.com/en/coins/hyperliquid",creators:[{name:"Jeff",role:"Team lead"}],history:"Verified project history.",historySource:{name:"Project documentation",url:"https://example.com/history"},exchangeDescription:{text:"Exchange description.",name:"OKX",url:"https://www.okx.com/price/hyperliquid-hype"}};
    }
    await route.fulfill({json:{data}});
  });
  await page.goto(process.env.BASE_URL||"http://localhost:3002");
  await page.locator(".coin-name-trigger").click();
  await page.locator(".coin-project-picker").waitFor();
  await page.locator(".coin-project-picker button").filter({hasText:"Hyperliquid"}).click();
  await page.locator(".coin-info-description").first().waitFor();
  assert.equal(await page.locator("#coin-info-title").textContent(),"Hyperliquid");
  assert.ok((await page.locator(".coin-info-body").textContent()).includes("Jeff"));
  assert.equal(await page.locator(".coin-info-description").count(),3);
  await page.keyboard.press("Escape");await page.locator(".coin-name-trigger").click();
  await page.locator(".coin-info-description").first().waitFor();
  assert.equal(queries.at(-1).id,"hyperliquid");assert.equal(queries.at(-1).exchange,"binance");
  assert.deepEqual(errors,[]);
  console.log("PASS ambiguous ticker selection, correct project details, source/history/creators and remembered scoped choice");
}finally{await browser.close();}
