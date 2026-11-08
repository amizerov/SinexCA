import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];let sockets=0,closed=0;
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>{
    if(!socket.url().includes("@depth20")){socket.close();return;}
    sockets++;let id=0;const send=()=>socket.send(JSON.stringify({lastUpdateId:++id,bids:Array.from({length:20},(_,i)=>[(100-i*.01).toFixed(2),"2"]),asks:Array.from({length:20},(_,i)=>[(100.01+i*.01).toFixed(2),"3"])}));
    send();const timer=setInterval(send,150);socket.onClose(()=>{closed++;clearInterval(timer);});
  });
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",symbol="BTCUSDT";
    const data=url.pathname.endsWith("/pairs")?[{exchange,marketType:"spot",symbol,baseAsset:"BTC",quoteAsset:"USDT"}]:url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:1794000000+i*3600,open:100,close:100.01,high:101,low:99,volume:2})):url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:100,quantity:2}],asks:[{price:100.01,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[{exchange,symbol,lastPrice:100.01,high24h:101,low24h:99,priceChangePercent24h:1,quoteVolume24h:1000,receivedAt:Date.now()}];
    return route.fulfill({json:{data}});
  });
  await page.goto(baseURL);await page.locator('[aria-label="Показать стакан"]:enabled').waitFor();await page.getByRole("button",{name:"Показать стакан",exact:true}).click();
  const book=page.getByRole("dialog",{name:/^Стакан /});await book.getByRole("status",{name:"WebSocket",exact:true}).waitFor();
  assert.ok((await book.getAttribute("class")).includes("orderbook-docked"));
  const bookBox=await book.boundingBox(),chartBox=await page.locator(".chart-canvas").boundingBox();assert.ok(chartBox.x>bookBox.x+bookBox.width);assert.ok(chartBox.width>600);
  assert.match(await book.getByRole("columnheader").first().textContent(),/^Цена/);
  assert.equal(await book.locator(".book-bids .book-row").first().getByRole("cell").nth(1).textContent(),"2");assert.equal(await book.locator(".book-bids .book-row").first().getByRole("cell").nth(2).textContent(),"200");
  const separator=book.getByRole("separator",{name:"Ширина стакана"});await separator.focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowRight");assert.ok((await book.boundingBox()).width>=bookBox.width+20);
  const resizeBox=await separator.boundingBox();await page.mouse.move(resizeBox.x+3,resizeBox.y+100);await page.mouse.down();await page.mouse.move(resizeBox.x+63,resizeBox.y+100,{steps:6});await page.mouse.up();
  const width=(await book.boundingBox()).width;assert.ok(width>=bookBox.width+70);
  await book.getByRole("button",{name:"Настройки стакана",exact:true}).click();const menu=page.getByRole("region",{name:"Настройки стакана"});await menu.waitFor();
  await menu.getByRole("combobox",{name:"Полосы объёма",exact:true}).selectOption("cumulative");
  const cumulativeDepth=await book.locator(".book-bids .book-row").nth(1).evaluate(node=>parseFloat(node.style.getPropertyValue("--depth")));assert.ok(Math.abs(cumulativeDepth-4/60*100)<.001);
  await menu.getByRole("combobox",{name:"Строк на сторону",exact:true}).selectOption("5");assert.equal(await book.locator(".book-bids .book-row").count(),5);
  await menu.getByRole("combobox",{name:"Стороны стакана",exact:true}).selectOption("buy");assert.equal(await book.locator(".book-asks").count(),0);
  await menu.getByRole("spinbutton",{name:"Шаг группировки цены"}).fill("0.1");await menu.getByRole("spinbutton",{name:"Шаг группировки цены"}).blur();
  assert.ok(await book.locator(".book-bids .book-row").count()<5);
  await menu.getByRole("button",{name:"Закрыть настройки стакана"}).click();
  const before=sockets;await book.getByRole("button",{name:"Открепить стакан"}).click();await book.getByRole("button",{name:"Изменить размер стакана"}).waitFor();assert.equal(sockets,before,"Dock switch keeps the same market subscription");
  const floating=await book.boundingBox(),header=await book.locator(".orderbook-window-header").boundingBox();await page.mouse.move(header.x+40,header.y+15);await page.mouse.down();await page.mouse.move(header.x-300,header.y+65,{steps:8});await page.mouse.up();assert.ok((await book.boundingBox()).x<floating.x-250);
  await book.getByRole("button",{name:"Закрепить стакан"}).click();assert.equal((await book.boundingBox()).width,width);
  await page.reload();await book.getByRole("status",{name:"WebSocket",exact:true}).waitFor();assert.ok((await book.getAttribute("class")).includes("orderbook-docked"));assert.equal((await book.boundingBox()).width,width);assert.equal(await book.locator(".book-asks").count(),0);
  await book.getByRole("button",{name:"Настройки стакана",exact:true}).click();await menu.waitFor();await page.keyboard.press("Escape");await menu.waitFor({state:"hidden"});assert.equal(await book.isVisible(),true);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/orderbook-docked.png"});
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.locator(".timeframe-select").isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  await page.setViewportSize({width:320,height:568});assert.ok(!(await book.getAttribute("class")).includes("orderbook-docked"));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  await book.getByRole("button",{name:"Настройки стакана",exact:true}).click();await menu.waitFor();assert.ok(await menu.evaluate(node=>{const box=node.getBoundingClientRect();return box.top>=0&&box.left>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;}));await page.screenshot({path:".qa/orderbook-docked-mobile.png"});
  await menu.getByRole("button",{name:"Скрыть стакан",exact:true}).click();await book.waitFor({state:"hidden"});assert.ok(closed>0);assert.deepEqual(errors,[]);
  console.log("PASS docked book, real row notionals, grouping/cumulative bars, width drag/keys, single subscription, floating drag, saved settings, mobile and Escape");
}finally{await browser.close();}
