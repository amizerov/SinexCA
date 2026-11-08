import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const owner="account-history-test",now=Date.now(),open={id:"open-buy",exchange:"binance",symbol:"SOLUSDT",base:"SOL",quote:"USDT",side:"buy",orderType:"limit",status:"open",quantityAtoms:100000000,filledAtoms:0,limitPriceAtoms:null,limitPrice:90,reservedUnits:90090000,reservedCurrency:"USDT",createdAt:now,updatedAt:now};
  const closed={...open,id:"closed-buy",status:"filled",filledAtoms:100000000,reservedUnits:0};
  const snapshot={id:"test-account",mode:"paper",balances:[{currency:"USDT",decimals:6,availableUnits:100000000,reservedUnits:90090000},{currency:"SOL",decimals:8,availableUnits:200000000,reservedUnits:100000000}],operations:[],operationCount:1,deposits:[{id:"deposit",kind:"deposit",currency:"USDT",decimals:6,availableDelta:190090000,availableAfter:190090000,createdAt:now}],depositCount:1,orders:[closed,open],orderCount:52,openOrderCount:1,fillCount:1,openOrders:[open],closedOrders:[closed],fills:[{id:"execution",orderId:closed.id,exchange:"binance",symbol:"SOLUSDT",base:"SOL",quote:"USDT",side:"buy",price:89,quantityAtoms:100000000,settlementCurrency:"USDT",settlementUnits:89000000,feeUnits:89000,createdAt:now}]};
  await context.route("**/api/auth/session",r=>r.fulfill({json:{data:{ownerId:owner,user:null,googleAvailable:false}}}));
  await context.route("**/api/paper/account*",r=>{const offset=Number(new URL(r.request().url()).searchParams.get("offset")||0);return r.fulfill({json:{ownerId:owner,data:{...snapshot,historyOffset:offset,orders:offset?[{...closed,id:"older-order"}]:snapshot.orders,closedOrders:offset?[{...closed,id:"older-order"}]:snapshot.closedOrders}}});});
  await page.goto(`${base}/account`);const history=page.getByRole("region",{name:"Заявки и сделки",exact:true});await history.waitFor();
  assert.equal(await history.getByRole("tab",{name:/Открытые/}).getAttribute("aria-selected"),"true");assert.ok((await history.getByRole("tabpanel").innerText()).includes("90,09 USDT"));assert.equal(await history.getByRole("cell",{name:"Исполнен",exact:true}).count(),0);
  const reserves=await page.getByRole("region",{name:"Зарезервировано заявками",exact:true}).innerText();assert.ok(reserves.includes("90,09"));assert.ok(reserves.includes("1,00"));assert.ok(reserves.includes("SOL"));
  await history.getByRole("tab",{name:/Закрытые/}).click();assert.ok((await history.getByRole("tabpanel").innerText()).includes("Исполнен"));await history.getByRole("button",{name:"Далее",exact:true}).click();await page.waitForResponse(r=>r.url().includes("offset=50"));await history.getByRole("button",{name:"Назад",exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[role="tabpanel"]')?.textContent.includes("51–51"));
  await history.getByRole("tab",{name:/Сделки/}).click();await page.waitForFunction(()=>document.querySelector('[role="tabpanel"]')?.textContent.includes("0,089"));const fills=await history.getByRole("tabpanel").innerText();assert.equal(await history.getByRole("cell",{name:"89,00 USDT",exact:true}).count(),2);assert.ok(fills.includes("1,00 SOL"));assert.ok(fills.includes("0,089 USDT"));
  await history.getByRole("tab",{name:/Пополнения/}).click();assert.ok((await history.getByRole("tabpanel").innerText()).includes("Тестовое пополнение"));
  await history.getByRole("tab",{name:/История заявок/}).click();await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/account-order-history.png"});await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log("PASS: account reserves by currency/order, open/closed tabs, fills and fees, history pagination and mobile layout");await context.close();
}finally{await browser.close();}
