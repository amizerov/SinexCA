import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on("pageerror",error=>errors.push(error.message));
try{
  const session=await(await context.request.get(`${baseURL}/api/auth/session`)).json(),preferences=await(await context.request.get(`${baseURL}/api/indicators`)).json();
  const settings=preferences.data.settings;settings.ema[1].enabled=true;settings.ema[2].enabled=true;
  assert.equal((await context.request.put(`${baseURL}/api/indicators`,{headers:{"X-Workspace-Id":session.data.ownerId},data:{revision:preferences.data.revision,settings,mutationId:crypto.randomUUID()}})).status(),200);
  for(const exchange of ["binance","bybit"]){const scope={exchange,marketType:"spot",symbol:"BTCUSDT"};assert.equal((await context.request.put(`${baseURL}/api/drawings`,{headers:{"X-Workspace-Id":session.data.ownerId},data:{scope,revision:0,mutationId:crypto.randomUUID(),levels:[{id:crypto.randomUUID(),price:75000,color:"#63c8ff"}]}})).status(),200);}
  await page.goto(baseURL);await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});
  for(const exchange of ["bybit","binance","bybit"]){
    await page.locator(".exchange-tabs button").filter({hasText:exchange==="bybit"?"Bybit":"Binance"}).click();
    for(const interval of ["1d","15m","4h","1h"]){await page.getByRole("button",{name:interval,exact:true}).click();await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});await page.waitForTimeout(180);}
  }
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/chart-switching.png"});
  console.log("Errors:",errors);
  const rendering=await page.locator(".chart-canvas canvas").evaluateAll(canvases=>canvases.map(canvas=>({width:canvas.width,height:canvas.height,colors:(()=>{const ctx=canvas.getContext("2d"),set=new Set();if(!ctx||!canvas.width||!canvas.height)return 0;const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<pixels.length;i+=68)if(pixels[i+3])set.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return set.size;})()})));
  console.log("Rendering:",JSON.stringify(rendering));assert.ok(rendering.some(canvas=>canvas.colors>8),"Chart must contain rendered pixels");assert.deepEqual(errors,[]);
  console.log("PASS exchange/timeframe switching with EMA 50/200 keeps chart rendered");
}finally{await browser.close();}
