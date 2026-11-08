import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on("pageerror",error=>errors.push(error.message));const requests=[];page.on("request",request=>{if(request.url().includes("/api/market/candles"))requests.push(request.url());});
async function settings(){const response=await context.request.get(`${baseURL}/api/indicators`);assert.equal(response.status(),200);return(await response.json()).data;}
async function open(){await page.getByRole("button",{name:"Индикаторы",exact:true}).click();await page.getByRole("dialog",{name:"Индикаторы",exact:true}).waitFor();await page.getByRole("button",{name:"Применить",exact:true}).waitFor();}
async function apply(){await page.getByRole("button",{name:"Применить",exact:true}).click();await page.getByRole("dialog",{name:"Индикаторы",exact:true}).waitFor({state:"hidden"});}
try{
  await page.goto(baseURL);await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});await page.waitForFunction(()=>document.querySelector('[data-preferences-status="saved"]'));
  await open();await page.getByRole("checkbox",{name:"EMA 1",exact:true}).check();await page.getByRole("checkbox",{name:"EMA 2",exact:true}).check();await page.getByRole("checkbox",{name:"RSI",exact:true}).check();await page.getByRole("spinbutton",{name:"Период EMA 1",exact:true}).fill("25");await apply();
  assert.equal((await settings()).settings.ema[0].period,25);assert.equal((await settings()).settings.rsi.enabled,true);assert.equal(await page.locator(".indicator-open b").textContent(),"3");
  await page.waitForResponse(response=>response.url().includes("/api/market/candles")&&response.url().includes("limit=1000")&&response.status()===200,{timeout:30000}).catch(()=>assert.ok(requests.some(url=>url.includes("limit=1000"))));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);const withRsi=await page.locator(".chart-canvas canvas").count();assert.ok(withRsi>=8);
  await page.reload();await page.locator(".indicator-open b").filter({hasText:"3"}).waitFor();await open();assert.equal(await page.getByRole("spinbutton",{name:"Период EMA 1",exact:true}).inputValue(),"25");await page.getByRole("checkbox",{name:"SMA",exact:true}).check();await page.getByRole("button",{name:"Отмена",exact:true}).click();assert.equal((await settings()).settings.sma.enabled,false);
  await open();await page.getByRole("checkbox",{name:"Показывать объём",exact:true}).uncheck();await apply();assert.equal((await settings()).settings.volume,false);assert.ok(await page.locator(".chart-canvas canvas").count()<withRsi);
  await page.getByRole("button",{name:"Показать или скрыть объём",exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Показать или скрыть объём"]').getAttribute("aria-pressed")==="true");
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/indicators-chart.png"});await open();await page.screenshot({path:".qa/indicators-dialog.png"});
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);await page.screenshot({path:".qa/indicators-mobile.png"});await page.getByRole("button",{name:"Закрыть индикаторы",exact:true}).click();
  await page.setViewportSize({width:1440,height:900});await open();await page.getByRole("button",{name:"Сбросить",exact:true}).click();await apply();assert.equal((await settings()).settings.rsi.enabled,false);assert.equal(await page.locator(".indicator-open b").count(),0);
  assert.deepEqual(errors,[]);console.log("PASS EMA/RSI dialog, period settings, warmup request, SQLite reload, cancel, volume pane removal/restoration, mobile modal, reset and pane cleanup");
}catch(error){console.error("Page errors:",errors);await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/indicators-failure.png"});throw error;}finally{await browser.close();}
