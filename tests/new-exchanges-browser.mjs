import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(baseURL);
  for(const [id,name]of [["whitebit","WhiteBIT"],["cryptocom","Crypto.com"]]){
    if(await page.locator(".exchange-select").isVisible())await page.locator(".exchange-select").selectOption(id);else await page.getByRole("button",{name,exact:true}).click();
    await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:45000});
    await page.getByRole("button",{name:"Показать стакан",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:/^Стакан /});await dialog.getByRole("status",{name:"WebSocket",exact:true}).waitFor({timeout:30000});
    assert.ok(await dialog.locator(".book-bids .book-row").count()>0);
    await dialog.getByRole("button",{name:"Закрыть стакан"}).click();
    console.log("PASS",name,"500 candles, real WebSocket book");
  }
  for(const width of [1920,1440,1280,1024,375,320]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false,`${width}: terminal overflows`);
  }
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/new-exchanges-mobile.png"});
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
