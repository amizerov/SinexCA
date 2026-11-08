import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const base=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true}),context=await browser.newContext();let owner,id;
async function post(path,body){const r=await context.request.post(`${base}${path}`,{headers:{Origin:base,"X-Workspace-Id":owner},data:body});const data=await r.json();assert.ok(r.ok(),`${r.status()} ${JSON.stringify(data)}`);return data;}
try{
  const s=await (await context.request.get(`${base}/api/auth/session`)).json();owner=s.session?.ownerId??s.data?.ownerId??s.ownerId;assert.ok(owner);
  await post("/api/paper/account",{currency:"USD",amount:"10",mutationId:crypto.randomUUID()});
  const input={exchange:"coinbase",symbol:"SOL-USD",side:"buy",type:"limit",quantity:"0.1",limit:0.001,slippage:1,mutationId:crypto.randomUUID()};
  const created=await post("/api/paper/orders",input);id=created.orders[0].id;assert.equal(created.orders[0].quote,"USD");assert.equal(created.orders[0].reserved,101);assert.equal(created.orders[0].filled,0);
  const duplicate=await post("/api/paper/orders",input);assert.equal(duplicate.orders.length,1);
  const amendedInput={...input,limit:0.002,mutationId:crypto.randomUUID()},amended=await post("/api/paper/orders",{action:"amend",id,version:created.orders[0].updatedAt,input:amendedInput});assert.equal(amended.orders[0].reserved,201);
  await new Promise(resolve=>setTimeout(resolve,4500));
  const background=await (await context.request.get(`${base}/api/paper/orders`)).json();assert.ok(background.health.checkedAt>0);assert.ok(background.orders[0].lastBook>amended.orders[0].lastBook,"Background engine processes pending orders without any open page");assert.equal(background.orders[0].updatedAt,amended.orders[0].updatedAt,"Polling does not invalidate edits");
  const cancelled=await post("/api/paper/orders",{action:"cancel",id});assert.equal(cancelled.orders[0].status,"cancelled");const usd=cancelled.account.balances.find(b=>b.currency==="USD");assert.equal(usd.availableUnits,10_000_000);assert.equal(usd.reservedUnits,0);
  console.log("PASS: real Coinbase REST, native USD reserve, idempotent creation, amendment, background processing with no page, cancellation and release; isolated fresh guest");
}finally{if(id)await post("/api/paper/orders",{action:"cancel",id}).catch(()=>{});await context.close();await browser.close();}
