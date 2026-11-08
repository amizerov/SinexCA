import { chromium } from "playwright-core";
import { exchangeTimeframes } from "../lib/market/intervals.ts";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on("pageerror",error=>errors.push(error.message));
async function chooseExchange(exchange){if(await page.locator(".exchange-select").isVisible())await page.locator(".exchange-select").selectOption(exchange);else await page.locator(".exchange-tabs button").nth(["binance","bybit","okx","bitget","gate","kraken","coinbase","kucoin","bitfinex","htx","mexc"].indexOf(exchange)).click();}
async function chooseTimeframe(timeframe){if(await page.locator(".timeframe-select").isVisible())await page.locator(".timeframe-select").selectOption(timeframe);else await page.getByRole("button",{name:timeframe,exact:true}).click();}
async function loaded(){await page.locator(".chart-caption").filter({hasText:/\d+ свечей/}).waitFor({timeout:30000});await page.waitForTimeout(150);}
async function rendered(){assert.ok(await page.locator(".chart-canvas canvas").evaluateAll(canvases=>canvases.some(canvas=>{if(!canvas.width||!canvas.height)return false;const data=canvas.getContext("2d")?.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();if(!data)return false;for(let i=0;i<data.length;i+=100)if(data[i+3])colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);return colors.size>8;})),"Chart must render after interval changes");}
try{
  const account=(await(await context.request.get(`${baseURL}/api/auth/session`)).json()).data;
  const prefs=(await(await context.request.get(`${baseURL}/api/indicators`)).json()).data;prefs.settings.ema[1].enabled=true;prefs.settings.ema[2].enabled=true;
  await context.request.put(`${baseURL}/api/indicators`,{headers:{"X-Workspace-Id":account.ownerId},data:{...prefs,mutationId:crypto.randomUUID()}});
  await page.goto(baseURL);await loaded();
  for(const exchange of ["binance","bybit","okx","bitget","gate","kraken","coinbase","kucoin","bitfinex","htx","mexc"]){await chooseExchange(exchange);await loaded();const options=await page.locator(".timeframe-select option").evaluateAll(nodes=>nodes.map(node=>node.value));assert.deepEqual(options,exchangeTimeframes(exchange));}
  for(const [exchange,tf] of [["bybit","3m"],["bybit","1M"],["kraken","15d"],["binance","1s"],["okx","2d"],["bitfinex","3h"],["bybit","1d"]]){await chooseExchange(exchange);await chooseTimeframe(tf);await loaded();await rendered();}
  await chooseExchange("binance");assert.equal(await page.locator(".timeframe-select").inputValue(),"1d","Switching exchanges preserves the current interval");
  await page.setViewportSize({width:320,height:568});assert.equal(await page.locator(".timeframe-select").isVisible(),true);await chooseTimeframe("5m");await loaded();await rendered();assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth),false);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/intervals-mobile.png"});assert.deepEqual(errors,[]);console.log("PASS exchange-specific lists for 11 exchanges, native new intervals, per-exchange selection, EMA switching, rendered candles and compact mobile selector");
}catch(error){console.error(errors);await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/intervals-failure.png"});throw error;}finally{await browser.close();}
