import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),first=await context.newPage(),second=await context.newPage(),errors=[];
for(const page of [first,second])page.on("pageerror",error=>errors.push(error.message));
const open=async page=>{await page.getByRole("button",{name:"Индикаторы",exact:true}).click();await page.getByRole("dialog",{name:"Индикаторы",exact:true}).waitFor();};
const apply=async page=>{await page.getByRole("button",{name:"Применить",exact:true}).click();await page.getByRole("dialog",{name:"Индикаторы",exact:true}).waitFor({state:"hidden"});};
try{
  await first.goto(baseURL);await first.locator(".pair-row").first().waitFor();await second.goto(baseURL);await second.locator(".pair-row").first().waitFor();
  await open(first);await first.getByRole("checkbox",{name:"EMA 1",exact:true}).check();await apply(first);await second.locator(".indicator-open b").filter({hasText:"1"}).waitFor();
  await open(first);await open(second);await second.getByRole("checkbox",{name:"EMA 2",exact:true}).check();await apply(second);await first.locator(".indicator-open b").filter({hasText:"2"}).waitFor();
  await first.getByRole("button",{name:"Применить",exact:true}).click();await first.getByRole("alert").filter({hasText:"другой вкладке"}).waitFor();
  const data=(await(await context.request.get(`${baseURL}/api/indicators`)).json()).data;assert.equal(data.settings.ema[1].enabled,true,"An older open dialog must not overwrite settings from another tab");
  await first.getByRole("button",{name:"Закрыть индикаторы",exact:true}).click();await first.getByRole("button",{name:"Bybit",exact:true}).click();await first.locator(".indicator-open b").filter({hasText:"2"}).waitFor();await open(first);assert.equal(await first.getByRole("checkbox",{name:"EMA 1",exact:true}).isChecked(),true);assert.equal(await first.getByRole("checkbox",{name:"EMA 2",exact:true}).isChecked(),true);assert.deepEqual(errors,[]);console.log("PASS global indicator settings sync across tabs/exchanges and an old dialog cannot overwrite a newer revision");
}finally{await browser.close();}
