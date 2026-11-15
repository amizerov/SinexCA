import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const browser=await chromium.launch({channel:"chrome",headless:true}),base=process.env.BASE_URL||"http://127.0.0.1:3017";
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[],sockets=new Map(),requests=[];
  page.setDefaultNavigationTimeout(120000);
  const last=Math.floor(Date.now()/60000)*60;
  const candles=symbol=>Array.from({length:1000},(_,i)=>({time:last-(999-i)*60,open:100+Math.sin(i/10)*4,high:102+Math.sin(i/10)*4,low:98+Math.sin(i/10)*4,close:101+Math.sin(i/10)*4,volume:(i%5+1)*(symbol==="ETHUSDT"?10:1)}));
  let incomplete=false;
  page.on("pageerror",e=>{errors.push(e.message);console.log(e.stack);});
  await context.routeWebSocket(/wss:\/\//,socket=>{if(socket.url().includes("@kline_"))sockets.set(socket.url(),socket);else socket.close();});
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",symbol=url.searchParams.get("symbol")||"BTCUSDT";
    let data=[];
    if(url.pathname.endsWith("/pairs"))data=["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:"USDT",priceIncrement:.01}));
    if(url.pathname.endsWith("/candles"))data=candles(symbol).slice(-Number(url.searchParams.get("limit")||500));
    if(url.pathname.endsWith("/volume-profile")){
      const from=Number(url.searchParams.get("from")),to=Number(url.searchParams.get("to"));requests.push({from,to,symbol});
      data={candles:candles(symbol).filter(c=>c.time>=from&&c.time<to),timeframe:"1m",from,to,complete:!incomplete,tick:.01};
    }
    if(url.pathname.endsWith("/orderbook"))data={exchange,symbol,bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null};
    return route.fulfill({json:{data}});
  });
  await context.request.get(`${base}/api/auth/session`);await page.goto(base);
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor().catch(async e=>{console.log(errors,await page.locator("body").innerText());await page.screenshot({path:".qa/profile-failure.png"});throw e;});await page.locator(".timeframe-select").selectOption("1m",{force:true});
  const open=async()=>{await page.getByRole("button",{name:"Индикаторы",exact:true}).click();await page.locator('.indicator-section-toggle[aria-controls="indicator-section-profile"]').click();};
  await open();await page.getByRole("tab",{name:"Каталог",exact:true}).click();await page.getByLabel("Поиск индикатора").fill("Volume Profile");
  await page.getByRole("listitem").filter({hasText:"Профиль объёма — Volume Profile"}).getByRole("button",{name:"Добавить",exact:true}).click();
  assert.equal(await page.getByLabel("Ширина профиля",{exact:true}).inputValue(),"15");
  await page.getByRole("button",{name:"Применить",exact:true}).click();
  const caption=page.locator("[data-profile-total]");
  await page.waitForFunction(()=>Number(document.querySelector("[data-profile-total]")?.dataset.profileTotal)>0);
  assert.match(await caption.textContent(),/Приближённо по свечам/);
  const query=requests.at(-1),expected=candles("BTCUSDT").filter(c=>c.time>=query.from&&c.time<query.to).reduce((sum,c)=>sum+c.volume,0);
  assert.equal(Number(await caption.getAttribute("data-profile-total")),expected);assert.ok(Number(await caption.getAttribute("data-profile-poc"))>0);
  const box=await page.locator(".chart-canvas").boundingBox();
  const before=await caption.getAttribute("data-profile-total"),poc=await caption.getAttribute("data-profile-poc");
  // Change only the price axis. Calculation and source range must stay unchanged.
  await page.mouse.move(box.x+box.width-30,box.y+100);await page.mouse.down();await page.mouse.move(box.x+box.width-30,box.y+190,{steps:10});await page.mouse.up();await page.waitForTimeout(600);
  assert.equal(await caption.getAttribute("data-profile-total"),before);assert.equal(await caption.getAttribute("data-profile-poc"),poc);
  const socket=[...sockets.entries()].find(([url])=>url.includes("btcusdt@kline_1m"))?.[1];assert.ok(socket);
  const current=candles("BTCUSDT").at(-1),event={e:"kline",s:"BTCUSDT",k:{t:current.time*1000,i:"1m",o:String(current.open),h:String(current.high),l:String(current.low),c:String(current.close),v:"13"}};
  socket.send(JSON.stringify(event));await page.waitForTimeout(400);const updated=await caption.getAttribute("data-profile-total");
  if(current.time>=query.from&&current.time<query.to)assert.equal(Number(updated),expected-current.volume+13);
  socket.send(JSON.stringify(event));await page.waitForTimeout(400);assert.equal(await caption.getAttribute("data-profile-total"),updated);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/profile-dark.png",fullPage:true});
  await page.getByRole("button",{name:"Переключить светлую и тёмную тему",exact:true}).click();await page.screenshot({path:".qa/profile-light.png",fullPage:true});
  const previousRequests=requests.length;
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.4,{steps:10});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector("[data-profile-total]")?.textContent.includes("Загрузка")===false);await page.waitForTimeout(1000);assert.ok(requests.length>previousRequests,"Time scrolling reloads profile range");
  await page.setViewportSize({width:1100,height:750});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await open();await page.getByLabel("Положение профиля",{exact:true}).selectOption("right");await page.getByLabel("Ширина профиля",{exact:true}).fill("25");await page.getByLabel("Цвет профиля",{exact:true}).fill("#5c8fbc");await page.getByRole("button",{name:"Применить",exact:true}).click();
  await page.reload();await caption.waitFor();await open();assert.equal(await page.getByLabel("Положение профиля",{exact:true}).inputValue(),"right");assert.equal(await page.getByLabel("Ширина профиля",{exact:true}).inputValue(),"25");assert.equal(await page.getByLabel("Цвет профиля",{exact:true}).inputValue(),"#5c8fbc");await page.getByRole("button",{name:"Закрыть индикаторы",exact:true}).click();
  const manager=()=>page.getByRole("dialog",{name:"Управление макетами",exact:true});
  await page.locator(".current-layout").click();await manager().getByRole("button",{name:"Сохранить как…",exact:true}).click();await page.getByLabel("Название макета",{exact:true}).fill("Volume Profile");await page.getByRole("button",{name:"Создать",exact:true}).click();await manager().getByRole("button",{name:"Закрыть",exact:true}).click();
  await page.locator(".current-layout").click();await manager().getByRole("button",{name:"Основной",exact:true}).click();await caption.waitFor({state:"detached"});
  await page.locator(".current-layout").click();await manager().getByRole("button",{name:"Volume Profile",exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector("[data-profile-total]")?.dataset.profileTotal)>0);
  await page.setViewportSize({width:390,height:844});await open();assert.equal(await page.evaluate(()=>{const d=document.querySelector('.indicator-dialog');return d.scrollWidth>d.clientWidth+1;}),false);await page.screenshot({path:".qa/profile-mobile.png"});await page.getByRole("button",{name:"Закрыть индикаторы",exact:true}).click();await page.setViewportSize({width:1600,height:1000});
  await page.locator(".pair-row").filter({hasText:"ETH/USDT"}).click();await page.waitForFunction(()=>Number(document.querySelector("[data-profile-total]")?.dataset.profileTotal)>0);assert.equal(requests.at(-1).symbol,"ETHUSDT");
  incomplete=true;await open();await page.getByLabel("Период профиля",{exact:true}).selectOption("day");await page.getByRole("button",{name:"Применить",exact:true}).click();await caption.filter({hasText:"Нет полной истории дня"}).waitFor();assert.equal(await caption.getAttribute("data-profile-total"),"0");
  await open();await page.getByLabel("Профиль объёма",{exact:true}).uncheck();await page.getByRole("button",{name:"Применить",exact:true}).click();await caption.waitFor({state:"detached"});
  const stopped=requests.length;await page.waitForTimeout(1200);assert.equal(requests.length,stopped);assert.deepEqual(errors,[]);
  console.log("PASS Volume Profile: catalog, volume/POC, price scale, scrolling, resize, themes, duplicate candle, reload, pair, incomplete day and cleanup");
}finally{await browser.close();}
