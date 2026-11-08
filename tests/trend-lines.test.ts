import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { AccountStore } from "../lib/server/account-store";
import { PrivateDrawingStore } from "../lib/server/private-drawing-store";
import { DrawingConflict } from "../lib/server/drawing-store";
import { levelSchema } from "../lib/drawings/types";
import { logicalAtTime,timeAtLogical } from "../lib/drawings/coordinates";
import type { Candle } from "../lib/market/types";
test("trend geometry and styling persist, stay isolated, transfer on registration and preserve revision conflicts",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-trends-")),path=join(directory,"db.sqlite");let accounts=new AccountStore(path,false);
  const scope={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT"},line={id:randomUUID(),type:"trend",price:100,color:"#63c8ff",startTime:1000,endTime:2000,endPrice:110,width:3,style:"dashed"};
  try {
    const guest=accounts.createGuest(),other=accounts.createGuest();let store=new PrivateDrawingStore(accounts.db);
    const mutationId=randomUUID();store.save(guest.session.ownerId,{scope,revision:0,mutationId,levels:[line]});assert.deepEqual(store.read(guest.session.ownerId,scope).levels,[line]);
    assert.equal(store.save(guest.session.ownerId,{scope,revision:0,mutationId,levels:[line]}).revision,1);
    assert.deepEqual(store.read(other.session.ownerId,scope).levels,[]);assert.deepEqual(store.read(guest.session.ownerId,{...scope,exchange:"bybit"}).levels,[]);
    assert.throws(()=>store.save(guest.session.ownerId,{scope,revision:0,mutationId:randomUUID(),levels:[]}),DrawingConflict);
    const account=accounts.register("trend@example.com","hash",guest.session);assert.deepEqual(store.read(account.session.ownerId,scope).levels,[line]);
    accounts.close();accounts=new AccountStore(path,false);store=new PrivateDrawingStore(accounts.db);assert.deepEqual(store.read(account.session.ownerId,scope).levels,[line]);
    store.save(account.session.ownerId,{scope,revision:1,mutationId:randomUUID(),levels:[]});assert.equal(Number(accounts.db.prepare("SELECT count(*) AS n FROM private_line_options").get()!.n),0);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
test("trend validation rejects incomplete, zero-duration or invalid endpoints while old levels remain valid",()=>{
  const old={id:randomUUID(),price:100,color:"#63c8ff"};assert.deepEqual(levelSchema.parse(old),old);
  const line={...old,type:"trend",startTime:1000,endTime:2000,endPrice:110};assert.equal(levelSchema.safeParse(line).success,true);
  for(const bad of [{...line,endTime:1000},{...line,endPrice:0},{...line,startTime:-1},{...line,endTime:undefined},{...old,endPrice:110},{...line,width:5},{...line,style:"other"}])assert.equal(levelSchema.safeParse(bad).success,false);
});
test("UTC coordinates interpolate between candles and survive timeframe changes without storing pixels",()=>{
  const candles=[1000,1060,1120].map(time=>({time,open:10,high:12,low:9,close:11,volume:1})) as Candle[];
  assert.equal(logicalAtTime(1090,candles),1.5);assert.equal(timeAtLogical(1.5,candles),1090);assert.equal(logicalAtTime(940,candles),-1);assert.equal(timeAtLogical(3,candles),1180);
  const wider=[1000,1300,1600].map(time=>({...candles[0],time}));assert.equal(timeAtLogical(logicalAtTime(1090,wider)!,wider),1090);
  assert.equal(logicalAtTime(1000,[]),null);
});
