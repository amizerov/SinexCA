import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:3017",browser=await chromium.launch({channel:"chrome",headless:true});
async function fixtures(context){
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance";
    const data=url.pathname.endsWith("/pairs")?["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:"USDT"})):url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:1700000000+i*3600,open:100+Math.sin(i/7)*2,high:101+Math.sin(i/7)*2,low:99+Math.sin(i/7)*2,close:100.4+Math.sin(i/7)*2,volume:10+i%10})):url.pathname.endsWith("/orderbook")?{exchange,symbol:url.searchParams.get("symbol"),bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[];
    return route.fulfill({json:{data}});
  });
}
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});await fixtures(context);
  await context.request.get(`${base}/api/auth/session`);
  const email=`layouts-${crypto.randomUUID()}@example.com`,password="Layouts-test-password-123456";
  assert.equal((await context.request.post(`${base}/api/auth/register`,{data:{email,password}})).status(),200);
  const page=await context.newPage(),errors=[],tradingWrites=[];page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{if(r.url().includes("/api/paper/")&&r.method()!=="GET")tradingWrites.push(r.url());});await page.goto(base);
  await page.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();
  const manager=()=>page.getByRole("dialog",{name:"Управление макетами",exact:true});
  const openManager=async()=>{await page.locator(".current-layout").click();await manager().waitFor();};
  const closeManager=async()=>{await manager().getByRole("button",{name:"Закрыть",exact:true}).click();};
  const copy=async name=>{await manager().getByRole("button",{name:"Сохранить как…",exact:true}).click();const field=page.getByLabel("Название макета",{exact:true});assert.equal(await field.evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length),true);await field.fill(name);await field.press("Enter");await manager().waitFor();};
  const choose=async name=>{await manager().getByRole("button",{name,exact:true}).click();};
  assert.equal(await page.locator(".topbar .layout-controls").count(),0);
  const topHeight=(await page.locator(".topbar").boundingBox()).height;
  await openManager();await copy("Основной анализ");await closeManager();
  await page.locator(".timeframe-select").selectOption("5m",{force:true});
  await page.getByLabel("Несохранённые изменения",{exact:true}).waitFor();
  await openManager();await choose("Основной");
  let prompt=page.getByRole("dialog",{name:"Сохранить изменения?",exact:true});await prompt.waitFor();await prompt.getByRole("button",{name:"Отмена",exact:true}).click();
  assert.equal(await page.locator(".timeframe-select").inputValue(),"5m");
  await choose("Основной");await prompt.getByRole("button",{name:"Перейти без сохранения",exact:true}).click();
  await page.locator(".current-layout").filter({hasText:"Макет: Основной"}).waitFor();assert.equal(await page.locator(".timeframe-select").inputValue(),"1h");
  await openManager();await choose("Основной анализ");assert.equal(await page.locator(".timeframe-select").inputValue(),"1h");
  await page.locator(".timeframe-select").selectOption("15m",{force:true});
  await openManager();await copy("Обзор рынка");await closeManager();
  await page.locator(".timeframe-select").selectOption("5m",{force:true});await openManager();await choose("Основной анализ");
  await prompt.getByRole("button",{name:"Сохранить и перейти",exact:true}).click();
  await page.locator(".current-layout").filter({hasText:"Основной анализ"}).waitFor();
  await openManager();await choose("Обзор рынка");assert.equal(await page.locator(".timeframe-select").inputValue(),"5m");
  // Drawings and indicator visibility belong to the saved layout, not the account's other layouts.
  await page.getByRole("button",{name:"Показать или скрыть объём",exact:true}).click();
  await page.getByRole("button",{name:"Горизонтальный уровень",exact:true}).click();const surface=page.locator(".drawing-surface");await surface.waitFor();await surface.click({position:{x:250,y:90}});
  await page.locator(".level-hit.selected").waitFor();const levelId=await page.locator(".level-hit.selected").getAttribute("data-level-id");
  await page.getByRole("button",{name:"Закрыть настройки уровня",exact:true}).click();
  await openManager();await manager().getByRole("button",{name:"Сохранить текущий",exact:true}).click();await closeManager();
  await page.reload();await page.locator(`[data-level-id="${levelId}"]`).waitFor();
  assert.equal(await page.getByRole("button",{name:"Показать или скрыть объём",exact:true}).getAttribute("aria-pressed"),"false");
  await openManager();await choose("Основной анализ");assert.equal(await page.locator(`[data-level-id="${levelId}"]`).count(),0);
  await openManager();await choose("Обзор рынка");await page.locator(`[data-level-id="${levelId}"]`).waitFor();
  await page.locator(".timeframe-select").selectOption("15m",{force:true});await openManager();
  await page.route("**/api/workspace",route=>route.request().method()==="PATCH"?route.fulfill({status:500,json:{error:{message:"Тестовый сбой сохранения"}}}):route.continue());
  await manager().getByRole("button",{name:"Сохранить текущий",exact:true}).click();await manager().getByRole("alert").filter({hasText:"Тестовый сбой"}).waitFor();await page.getByLabel("Несохранённые изменения",{exact:true}).waitFor();
  await page.unroute("**/api/workspace");await manager().getByRole("button",{name:"Сохранить текущий",exact:true}).click();await manager().getByRole("alert").waitFor({state:"detached"});await closeManager();
  await openManager();await manager().getByRole("button",{name:"Переименовать макет Обзор рынка",exact:true}).click();let field=page.getByLabel("Название макета",{exact:true});await field.fill("Основной анализ");await field.press("Enter");await page.getByRole("alert").filter({hasText:"Название уже занято"}).waitFor();await field.fill("Мой обзор");await field.press("Enter");await manager().waitFor();await closeManager();
  // Account menu opens the compact submenu without adding controls over the chart.
  await page.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).click();await page.getByRole("menuitem",{name:"Макеты",exact:true}).click();await page.getByRole("menu",{name:"Макеты",exact:true}).waitFor();
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/layouts-menu.png",fullPage:true});
  await page.getByRole("menuitem",{name:"Управление макетами…",exact:true}).click();await manager().waitFor();await page.screenshot({path:".qa/layouts-manager.png",fullPage:true});
  const clean=await browser.newContext({viewport:{width:1600,height:1000}});await fixtures(clean);assert.equal((await clean.request.post(`${base}/api/auth/login`,{data:{email,password}})).status(),200);
  const remote=await clean.newPage();remote.on("pageerror",e=>errors.push(e.message));await remote.goto(base);await remote.locator(".current-layout").filter({hasText:"Мой обзор"}).waitFor();await remote.locator(`[data-level-id="${levelId}"]`).waitFor();await clean.close();
  await manager().getByRole("button",{name:"Удалить макет Мой обзор",exact:true}).click();await page.getByRole("dialog",{name:"Удалить макет?",exact:true}).getByRole("button",{name:"Удалить",exact:true}).click();await manager().waitFor();assert.match(await page.locator(".current-layout").textContent(),/Основной анализ/);
  await manager().getByRole("button",{name:"Удалить макет Основной анализ",exact:true}).click();await page.getByRole("dialog",{name:"Удалить макет?",exact:true}).getByRole("button",{name:"Удалить",exact:true}).click();await manager().waitFor();await closeManager();
  assert.equal(await page.locator(".current-layout").textContent(),"Макет: Основной");assert.equal((await page.locator(".topbar").boundingBox()).height,topHeight);
  await page.setViewportSize({width:390,height:844});await openManager();await page.screenshot({path:".qa/layouts-mobile.png",fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const rect=await manager().boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);
  const guest=await browser.newContext({viewport:{width:1200,height:900}});await fixtures(guest);await guest.addInitScript(()=>localStorage.setItem("sinex:theme","dark"));const guestPage=await guest.newPage();guestPage.on("pageerror",e=>errors.push(e.message));await guestPage.goto(base);await guestPage.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();
  await guestPage.locator(".current-layout").click();const guestManager=guestPage.getByRole("dialog",{name:"Управление макетами",exact:true});await guestManager.getByRole("button",{name:"Сохранить как…",exact:true}).click();await guestPage.getByLabel("Название макета",{exact:true}).fill("Гостевой макет");
  await guestPage.evaluate(()=>{window.__originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error("Storage blocked");};});await guestPage.getByRole("button",{name:"Создать",exact:true}).click();await guestPage.getByRole("alert").filter({hasText:"Не удалось сохранить макет"}).waitFor();
  await guestPage.evaluate(()=>{Storage.prototype.setItem=window.__originalStorageWrite;});await guestPage.getByRole("button",{name:"Создать",exact:true}).click();await guestManager.waitFor();await guestPage.screenshot({path:".qa/layouts-dark.png",fullPage:true});await guestManager.getByRole("button",{name:"Закрыть",exact:true}).click();await guestPage.reload();await guestPage.locator(".current-layout").filter({hasText:"Гостевой макет"}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(tradingWrites,[]);console.log("PASS compact layouts: create/copy, dirty, all switch choices, save, drawings/volume restore, account clean-browser restore, rename/duplicates, menu, delete-last, unchanged header, mobile, no trading writes");
}finally{await browser.close();}
