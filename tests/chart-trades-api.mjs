import {request} from "playwright-core";
import assert from "node:assert/strict";
const base=process.env.BASE_URL||"http://localhost:3002",first=await request.newContext({baseURL:base}),second=await request.newContext({baseURL:base});
try{
  const session=(await(await first.get("/api/auth/session")).json()).data;
  for(const [exchange,symbol] of [["gate","HYPE_USDT"],["bybit","HYPEUSDT"]]){
    const response=await first.get(`/api/paper/chart-trades?${new URLSearchParams({exchange,symbol,from:"1700000000",to:"1900000000"})}`),body=await response.json();
    assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.ownerId,session.ownerId);assert.deepEqual(body.fills,[]);assert.equal(body.truncated,false);
  }
  const invalid=await first.get("/api/paper/chart-trades?exchange=gate&symbol=HYPE_USDT&from=100&to=99");assert.equal(invalid.status(),400);
  const another=await second.get("/api/paper/chart-trades?exchange=bybit&symbol=HYPEUSDT&from=1700000000&to=1900000000"),body=await another.json();assert.equal(another.status(),200);assert.notEqual(body.ownerId,session.ownerId);assert.deepEqual(body.fills,[]);
  console.log("PASS: real chart-trades endpoint, empty histories return 200, range validation, cookie continuity and owner isolation");
}finally{await first.dispose();await second.dispose();}
