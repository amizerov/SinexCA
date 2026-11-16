// Deterministic fixtures are intercepted only in this test; production always uses exchange data.
import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:3002";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.routeWebSocket(/wss:\/\//,socket=>{
    if(!socket.url().includes("@depth@100ms")){socket.close();return;}
    let sequence=100;const timer=setInterval(()=>socket.send(JSON.stringify({e:"depthUpdate",s:"BTCUSDT",E:Date.now(),U:++sequence,u:sequence,b:[["100",String(2+sequence%5)]],a:[]})),100);
    socket.onClose(()=>clearInterval(timer));
  });
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",symbol=url.searchParams.get("symbol")||"BTCUSDT",timeframe=url.searchParams.get("timeframe")||"1h",step=timeframe==="1m"?60:timeframe==="5m"?300:3600,now=Math.floor(Date.now()/1000/step)*step;
    const data=url.pathname.endsWith("/pairs")?[{exchange,marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"}]:url.pathname.endsWith("/candles")?Array.from({length:120},(_,i)=>({time:now-(119-i)*step,open:100+Math.sin(i/7)*2,high:101+Math.sin(i/7)*2,low:99+Math.sin(i/7)*2,close:100.5+Math.sin(i/7)*2,volume:20})):url.pathname.endsWith("/heatmap")?{lastUpdateId:100,bids:[["100","2"],["99","4"],["98","1"]],asks:[["101","3"],["102","4"],["103","1"]]}:url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[];
    return route.fulfill({json:{data}});
  });
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.locator(".chart-caption").filter({hasText:"120 свечей"}).waitFor();
  const edit=async(enabled,palette,apply=true,source="orderbook")=>{
    await page.getByRole("button",{name:"Индикаторы",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Индикаторы",exact:true});
    await dialog.getByRole("button",{name:"Ликвидность · Heatmap",exact:true}).click();
    await dialog.getByRole("checkbox",{name:"Тепловая карта ликвидности",exact:true}).setChecked(enabled);
    await dialog.getByLabel("Источник ликвидности",{exact:true}).selectOption(source);
    if(palette)await dialog.getByLabel("Палитра карты",{exact:true}).selectOption(palette);
    await dialog.getByRole("button",{name:apply?"Применить":"Отмена",exact:true}).click();
    await dialog.waitFor({state:"hidden"});
  };
  const waitOnline=()=>page.waitForFunction(()=>document.querySelector("[data-heatmap-status]")?.getAttribute("data-heatmap-status").startsWith("Онлайн"));
  await edit(true,undefined,true,"zones");
  await page.locator('[data-liquidity-mode="zones"]').waitFor({state:"attached"});
  assert.equal(await page.locator(".heatmap-controls,.heatmap-readable,.heatmap-status").count(),0);
  await page.waitForFunction(()=>Number(document.querySelector("[data-zone-count]")?.getAttribute("data-zone-count"))>0);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/liquidity-zones.png",fullPage:true});
  await edit(false);
  const initialTimeframe=await page.locator(".timeframe-select").inputValue();
  await edit(true,undefined,false);
  assert.equal(await page.locator("[data-heatmap-samples]").count(),0,"Cancel must not enable heatmap");
  await edit(true,"green");await waitOnline();
  assert.equal(await page.locator(".timeframe-select").inputValue(),initialTimeframe);
  assert.equal(await page.locator(".heatmap-controls,.heatmap-readable,.heatmap-status").count(),0,"Chart has no heatmap controls or legend");
  await page.waitForFunction(()=>Number(document.querySelector("[data-heatmap-samples]")?.getAttribute("data-heatmap-samples"))>0);
  await page.locator(".current-layout").click();let dialog=page.getByRole("dialog",{name:"Управление макетами",exact:true});
  await dialog.getByRole("button",{name:"Сохранить как…",exact:true}).click();
  await page.getByRole("textbox",{name:"Название макета",exact:true}).fill("Ликвидность");
  await page.getByRole("button",{name:"Создать",exact:true}).click();
  await page.getByRole("dialog",{name:"Управление макетами",exact:true}).getByRole("button",{name:"Закрыть",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector(".current-layout")?.textContent.includes("Ликвидность"));
  // Toggle off flushes recorded slices into IndexedDB before reloading.
  await page.waitForTimeout(2200);await edit(false);
  await page.waitForFunction(async()=>new Promise(resolve=>{const req=indexedDB.open("sinex-liquidity-v1",1);req.onsuccess=()=>{const db=req.result,r=db.transaction("history").objectStore("history").get("binance:spot:BTCUSDT");r.onsuccess=()=>{resolve(r.result?.slices.length>0);db.close();};};}));
  await page.reload();await page.getByRole("button",{name:"Индикаторы",exact:true}).waitFor();assert.equal(await page.locator("[data-heatmap-samples]").count(),0);
  await page.locator(".current-layout").click();dialog=page.getByRole("dialog",{name:"Управление макетами",exact:true});
  await dialog.getByRole("button",{name:"Основной",exact:true}).click();
  await page.getByRole("button",{name:"Перейти без сохранения",exact:true}).click();
  assert.equal(await page.locator("[data-heatmap-samples]").count(),0);
  await page.locator(".current-layout").click();await page.getByRole("dialog",{name:"Управление макетами",exact:true}).getByRole("button",{name:"Ликвидность",exact:true}).click();
  await waitOnline();
  await page.getByRole("button",{name:"Увеличить график",exact:true}).click();await page.getByRole("button",{name:"Свернуть график",exact:true}).click();
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/heatmap.png",fullPage:true});
  await page.getByRole("button",{name:"Bybit",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector("[data-heatmap-status]")?.getAttribute("data-heatmap-status")==="Снимки REST · 20 уровней");
  await page.waitForFunction(()=>Number(document.querySelector("[data-heatmap-samples]")?.getAttribute("data-heatmap-samples"))>0);
  await page.getByRole("button",{name:"5m",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector("[data-heatmap-status]")?.getAttribute("data-heatmap-status")==="Снимки REST · 20 уровней");
  assert.equal(await page.locator('.timeframe-select option[value="1s"]').count(),0);
  assert.equal(await page.locator(".heatmap-readable").count(),0);
  assert.equal(await page.locator(".timeframe-select").inputValue(),"5m");
  await page.screenshot({path:".qa/liquidity-bybit-5m.png",fullPage:true});
  assert.deepEqual(errors,[]);console.log("Liquidity: preserve interval, minute overview, Binance depth, Bybit REST on 5m without seconds, labeled levels, history, layouts and fullscreen passed");
}finally{await browser.close();}
