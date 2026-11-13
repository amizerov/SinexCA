// Deterministic market fixtures are limited to this browser test.
import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
const base=process.env.BASE_URL||"http://127.0.0.1:3017";
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance";
    const data=url.pathname.endsWith("/pairs")?["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:"USDT"})):url.pathname.endsWith("/candles")?Array.from({length:500},(_,i)=>({time:1700000000+i*3600,open:100,high:102,low:99,close:101,volume:10})):[];
    return route.fulfill({json:{data}});
  });
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base);
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor();
  await page.getByRole("button",{name:"Добавить BTC/USDT в избранное",exact:true}).click();
  await page.locator(".pair-row").filter({hasText:"ETH/USDT"}).click();
  await page.locator(".timeframe-select").selectOption("5m",{force:true});
  await page.locator('.chart-canvas[aria-label*="5m"]').waitFor();
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor();
  const canvas=page.locator(".chart-canvas");await canvas.hover();await page.mouse.wheel(0,-400);
  await page.waitForFunction(()=>{
    const raw=JSON.parse(localStorage.getItem("sinex:workspace:guest")||"null");
    return raw?.settings.recentPairs[0]?.symbol==="ETHUSDT"&&raw?.settings.chartViews["binance:spot:ETHUSDT:5m"];
  });
  await page.reload();await page.locator('.chart-canvas[aria-label*="ETHUSDT"][aria-label*="5m"]').waitFor();
  await page.getByRole("button",{name:"Избранное",exact:true}).click();
  await page.getByRole("button",{name:/BTC\/USDT.*Binance/}).click();
  await page.locator('.chart-canvas[aria-label*="BTCUSDT"]').waitFor();
  await page.getByRole("group",{name:"Списки пар"}).getByRole("button",{name:"История",exact:true}).click();
  await page.getByRole("button",{name:"Очистить историю",exact:true}).click();
  await page.getByText("История просмотров пуста",{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  const email=`state-${crypto.randomUUID()}@example.com`;
  const registered=await context.request.post(`${base}/api/auth/register`,{data:{email,password:"State-test-password-123456"}});
  assert.equal(registered.status(),200);const owner=(await registered.json()).data.ownerId;
  const recentPairs=Array.from({length:30},(_,i)=>({exchange:"binance",marketType:"spot",symbol:`ASSET${i}USDT`,baseAsset:`ASSET${i}`,quoteAsset:"USDT"}));
  const chartViews=Object.fromEntries(Array.from({length:100},(_,i)=>[`binance:spot:ASSET${i}USDT:1h`,{from:1700000000,to:1700003600}]));
  const saved=await context.request.patch(`${base}/api/workspace`,{headers:{"X-Workspace-Id":owner},data:{recentPairs,chartViews}});
  assert.equal(saved.status(),200);assert.deepEqual((await saved.json()).data.settings.recentPairs,recentPairs);
  assert.equal((await context.request.patch(`${base}/api/workspace`,{headers:{"X-Workspace-Id":"stale"},data:{recentPairs:[]}})).status(),409);
  console.log("PASS guest state: history, favorites, interval, viewport storage, reload, clear, mobile and no runtime errors");
}finally{await browser.close();}
