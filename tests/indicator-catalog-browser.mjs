import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({json:{data:path.endsWith("/pairs")?[{exchange:"binance",marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"}]:[]}});});
  await page.goto(process.env.BASE_URL||"http://localhost:3002");
  await page.getByRole("button",{name:"Индикаторы",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.indicator-dialog button[type="submit"]').disabled);
  await page.getByRole("spinbutton",{name:"Период EMA 1",exact:true}).fill("17");
  await page.getByRole("tab",{name:"Каталог",exact:true}).click();
  assert.ok(await page.getByRole("listitem").count()>100);
  assert.equal(await page.locator(".catalog-available").count(),4);
  await page.getByRole("textbox",{name:"Поиск индикатора"}).fill("MACD");
  assert.ok(await page.locator(".indicator-catalog-item strong").allTextContents().then(names=>names.includes("MACD")));
  await page.getByRole("combobox",{name:"Категория индикаторов"}).selectOption({label:"Ончейн"});
  assert.equal(await page.getByRole("listitem").count(),0);
  await page.getByRole("button",{name:"Очистить поиск индикаторов"}).click();
  assert.ok(await page.getByRole("listitem").count()>0);
  await page.getByRole("combobox",{name:"Категория индикаторов"}).selectOption("");
  await page.getByRole("textbox",{name:"Поиск индикатора"}).fill("Простая скользящая");
  await page.getByRole("button",{name:"Доступен",exact:true}).click();
  assert.equal(await page.getByRole("spinbutton",{name:"Период EMA 1",exact:true}).inputValue(),"17","Tab switches preserve unsaved draft");
  await page.getByRole("tab",{name:"Настройки",exact:true}).focus();await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab",{name:"Каталог",exact:true}).getAttribute("aria-selected"),"true");
  await page.getByRole("textbox",{name:"Поиск индикатора"}).fill("");
  for(const [width,height] of [[1440,900],[375,700],[320,568],[568,320]]){
    await page.setViewportSize({width,height});
    const sizes=await page.evaluate(()=>{const dialog=document.querySelector(".indicator-dialog"),list=document.querySelector(".indicator-catalog-list"),top=document.querySelector(".indicator-tabs").getBoundingClientRect().top;list.scrollTop=500;return {listHeight:list.clientHeight,listScroll:list.scrollTop,top,fixed:document.querySelector(".indicator-tabs").getBoundingClientRect().top===top,overflowX:dialog.scrollWidth-dialog.clientWidth,bottom:dialog.getBoundingClientRect().bottom};});
    assert.ok(sizes.listHeight>20,JSON.stringify({width,height,sizes}));assert.ok(sizes.listScroll>0);assert.ok(sizes.fixed);assert.ok(sizes.overflowX<=1);assert.ok(sizes.bottom<=height);
  }
  await page.setViewportSize({width:375,height:700});await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/indicator-catalog-mobile.png"});
  assert.deepEqual(errors,[]);console.log("PASS catalog of 100+ indicators, search/categories/statuses, preserved settings drafts, keyboard tabs and compact scrolling on mobile and landscape");
}finally{await browser.close();}
