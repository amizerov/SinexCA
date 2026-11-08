import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on("pageerror",error=>errors.push(error.message));const scope={exchange:"binance",marketType:"spot",symbol:"BTCUSDT"};
let ownerId,testId;
async function read(){const response=await page.request.get(`${baseURL}/api/drawings?${new URLSearchParams(scope)}`);assert.equal(response.status(),200);const json=await response.json();ownerId=json.ownerId;return json.data;}
async function saved(){await page.locator('[data-save-status="saved"]').waitFor();}
try {
  await read();await page.goto(baseURL);await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});await saved();
  await page.getByRole("button",{name:"Трендовая линия",exact:true}).click();const box=await page.locator(".chart-canvas").boundingBox();
  const p1={x:box.x+box.width*.35,y:box.y+box.height*.3},p2={x:box.x+box.width*.67,y:box.y+box.height*.55};
  await page.mouse.click(p1.x,p1.y);assert.equal((await read()).levels.length,0,"First point is a preview, not a database write");
  await page.mouse.move(p2.x,p2.y);await page.mouse.click(p2.x,p2.y);await saved();let doc=await read(),line=doc.levels.find(line=>line.type==="trend");assert.ok(line);testId=line.id;
  await page.getByRole("combobox",{name:"Стиль линии"}).selectOption("dashed");await page.getByRole("combobox",{name:"Толщина линии"}).selectOption("3");await saved();line=(await read()).levels.find(line=>line.id===testId);assert.equal(line.width,3);assert.equal(line.style,"dashed");
  const group=page.locator(`[data-trend-id="${testId}"]`);await group.waitFor();const end=await group.locator("circle").last().boundingBox();
  await page.mouse.move(end.x+6,end.y+6);await page.mouse.down();await page.mouse.move(end.x+45,end.y-22,{steps:6});await page.mouse.up();await saved();let moved=(await read()).levels.find(line=>line.id===testId);assert.notEqual(moved.endPrice,line.endPrice);assert.equal(moved.startTime,line.startTime);
  await page.getByRole("button",{name:"Отменить разметку",exact:true}).click();await saved();assert.equal((await read()).levels.find(line=>line.id===testId).endPrice,line.endPrice);
  await page.getByRole("button",{name:"Повторить разметку",exact:true}).click();await saved();assert.equal((await read()).levels.find(line=>line.id===testId).endPrice,moved.endPrice);
  await page.reload();await saved();await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor();assert.deepEqual((await read()).levels.find(line=>line.id===testId),moved);
  const hit=group.locator(".trend-hit");const geometry=await hit.evaluate(node=>({x:(Number(node.getAttribute("x1"))+Number(node.getAttribute("x2")))/2,y:(Number(node.getAttribute("y1"))+Number(node.getAttribute("y2")))/2}));const host=await page.locator(".chart-canvas-wrap").boundingBox();
  await page.mouse.move(host.x+geometry.x,host.y+geometry.y);await page.mouse.down();await page.mouse.move(host.x+geometry.x+28,host.y+geometry.y+22,{steps:5});await page.mouse.up();await saved();const translated=(await read()).levels.find(line=>line.id===testId);
  assert.notEqual(translated.startTime,moved.startTime);assert.ok(Math.abs((translated.endPrice-translated.price)-(moved.endPrice-moved.price))<1e-6);
  await page.getByRole("button",{name:"15m",exact:true}).click();await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor();assert.deepEqual((await read()).levels.find(line=>line.id===testId),translated);
  await page.getByRole("button",{name:"Трендовая линия",exact:true}).click();await page.mouse.click(p1.x,p1.y);await page.keyboard.press("Escape");assert.equal((await read()).levels.length,1);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/trend-lines.png"});assert.deepEqual(errors,[]);console.log("PASS preview, two-point creation, style/width, endpoint drag, undo/redo, SQLite reload, whole-line translation, timeframe anchoring, Escape cancellation");
}finally{
  try{if(testId){const doc=await read();await page.request.put(`${baseURL}/api/drawings`,{headers:{"X-Workspace-Id":ownerId},data:{scope,revision:doc.revision,mutationId:crypto.randomUUID(),levels:doc.levels.filter(line=>line.id!==testId)}});}}finally{await browser.close();}
}
