import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  // Isolate the quote/candle REST check from external browser network permissions.
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await page.goto(baseURL);await page.locator('[aria-label="Показать стакан"]:enabled').waitFor({timeout:30000});await page.getByRole("button",{name:"Coinbase",exact:true}).click();await page.locator(".asset-identity p").filter({hasText:"Coinbase"}).waitFor();
  const search=page.getByRole("textbox",{name:"Поиск торговой пары"}),selector=page.getByRole("combobox",{name:"Валюта котировки",exact:true});
  await search.fill("SOL");await page.locator(".pair-row").filter({has:page.locator(".pair-name strong").filter({hasText:/^SOL\/USD$/})}).click({timeout:30000});
  for(const quote of ["USD","USDT","BTC","EUR"]){
    await selector.selectOption(quote);await page.locator(".asset-name h1").filter({hasText:`SOL/${quote}`}).waitFor();
    await page.locator(".chart-caption").filter({hasText:/\d+ свечей/}).waitFor({timeout:45000});
    assert.equal(await page.locator(".error-banner").count(),0);
    console.log("PASS Coinbase real SOL/"+quote);
  }
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/quote-selection-desktop.png"});assert.deepEqual(errors,[]);
}finally{await browser.close();}
