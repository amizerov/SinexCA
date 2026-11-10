import {request} from "playwright-core";
import assert from "node:assert/strict";
const api=await request.newContext({baseURL:process.env.BASE_URL||"http://localhost:3002"});
try{
  const session=(await(await api.get("/api/auth/session")).json()).data,before=(await(await api.get("/api/paper/account")).json()).data;
  const response=await api.post("/api/paper/orders",{headers:{"X-Workspace-Id":session.ownerId},data:{action:"amend",id:crypto.randomUUID(),version:1,input:{exchange:"binance",symbol:"BTCUSDT",side:"buy",type:"limit",quantity:"1",limit:100,mutationId:crypto.randomUUID()}}}),body=await response.json();
  assert.equal(response.status(),400,JSON.stringify(body));assert.equal(body.error.code,"ORDER_EDIT_DISABLED");
  const after=(await(await api.get("/api/paper/account")).json()).data;assert.deepEqual(after.balances,before.balances);assert.deepEqual(after.orders,before.orders);
  console.log("PASS: real API rejects editing before market requests or balance mutations");
}finally{await api.dispose();}
