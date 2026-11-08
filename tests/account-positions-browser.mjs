import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const browser=await chromium.launch({channel:"chrome",headless:true}),base=process.env.BASE_URL||"http://localhost:3002";
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];let depth=true,price=78;const books=[];
  page.on("pageerror",e=>errors.push(e.message));await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  const position={key:"bybit:HYPE:USDT",exchange:"bybit",symbol:"HYPEUSDT",base:"HYPE",quote:"USDT",marketQuote:"USDT",quantity:50,available:50,cost:3873.87,average:77.4774,realized:0};
  const snapshot={id:"test",mode:"paper",balances:[{currency:"USDT",decimals:6,availableUnits:16126130000,reservedUnits:0},{currency:"HYPE",decimals:8,availableUnits:5e9,reservedUnits:0}],operations:[],operationCount:0,deposits:[],depositCount:0,orders:[],orderCount:0,openOrderCount:0,fillCount:1,portfolio:{positions:[position],venueBalances:[{exchange:"bybit",currency:"HYPE",decimals:8,availableUnits:5e9,reservedUnits:0}],unassigned:[{currency:"USDT",decimals:6,availableUnits:16126130000,reservedUnits:0}],blockedOrders:[]}};
  await context.route("**/api/auth/session",r=>r.fulfill({json:{data:{ownerId:"position-test",user:null,googleAvailable:false}}}));
  await context.route("**/api/paper/account*",r=>r.fulfill({json:{ownerId:"position-test",data:snapshot}}));
  await context.route("**/api/market/orderbook?*",r=>{const url=new URL(r.request().url());books.push(url.searchParams.get("exchange"));return r.fulfill({json:{data:{exchange:"bybit",symbol:"HYPEUSDT",bids:depth?[{price,quantity:20},{price:price-.1,quantity:30}]:[{price,quantity:1}],asks:[{price:price+.1,quantity:100}],receivedAt:Date.now(),exchangeTime:null}}});});
  await page.goto(`${base}/account`);const result=page.getByRole("region",{name:"Результат покупок",exact:true}),pnl=result.locator("[data-position-pnl]");await result.waitFor();await page.waitForFunction(()=>document.querySelector('[data-position-pnl]')?.textContent.includes("19,23"));assert.ok((await result.innerText()).includes("Bybit"));assert.ok((await result.innerText()).includes("50 HYPE"));assert.ok((await pnl.getAttribute("class")).includes("positive"));assert.ok((await page.locator('[data-currency="HYPE"]').innerText()).includes("Bybit · 50,00"));assert.ok(books.every(e=>e==="bybit"));
  assert.equal(await page.getByText("Каждый актив учитывается отдельно.",{exact:false}).count(),0);const asset=page.locator('[data-currency="HYPE"]');assert.equal(await asset.locator(".paper-asset-name .paper-asset-venue").innerText(),"Bybit · 50,00");const nameBox=await asset.locator("strong").boundingBox(),venueBox=await asset.locator(".paper-asset-venue").boundingBox();assert.ok(Math.abs((nameBox.y+nameBox.height/2)-(venueBox.y+venueBox.height/2))<2);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/account-positions-desktop.png"});
  price=75;await page.waitForFunction(()=>document.querySelector('[data-position-pnl]')?.classList.contains("negative"));assert.ok((await pnl.innerText()).includes("−")||(await pnl.innerText()).includes("-"));
  depth=false;await result.getByRole("status").filter({hasText:"Недостаточно глубины"}).waitFor();assert.equal(await pnl.innerText(),"—");
  await result.getByRole("button",{name:/50 HYPE/}).click();assert.equal(await pnl.count(),0);await result.getByRole("button",{name:/50 HYPE/}).click();await pnl.waitFor();
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:".qa/account-positions-mobile.png"});assert.deepEqual(errors,[]);console.log("PASS: venue-bound holdings, live depth valuation with fees, positive/negative PnL, insufficient liquidity, collapse and mobile bounds");await context.close();
}finally{await browser.close();}
