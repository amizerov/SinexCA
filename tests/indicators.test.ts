import { test } from "node:test";
import assert from "node:assert/strict";
import { ema,sma,rsi } from "../lib/indicators/calculate";
import { defaultIndicators,indicatorSettingsSchema } from "../lib/indicators/settings";
import { AccountStore } from "../lib/server/account-store";
import { IndicatorStore } from "../lib/server/indicator-store";
import { DrawingConflict } from "../lib/server/drawing-store";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const candles=(values:number[])=>values.map((close,i)=>({time:1000+i*60,close,open:close,high:close,low:close,volume:1}));
test("SMA rolling window and SMA-seeded EMA match hand calculations and do not emit premature values",()=>{
  const source=candles([1,2,3,10,5]);assert.deepEqual(sma(source,3).map(p=>p.value),[2,5,6]);assert.deepEqual(ema(source,3).map(p=>p.value),[2,6,5.5]);
  assert.deepEqual(ema(source.slice(0,2),3),[]);assert.equal(ema(source,3)[0].time,1120);
  const original=ema(source,3),changed=ema([...source.slice(0,-1),{...source.at(-1)!,close:9}],3);assert.deepEqual(changed.slice(0,-1),original.slice(0,-1));assert.equal(changed.at(-1)!.value,7.5);
  assert.throws(()=>ema(source,0),RangeError);
});
test("Wilder RSI uses N changes, smooths gains and losses, handles rising, falling and flat markets",()=>{
  assert.deepEqual(rsi(candles([1,2,3,4]),3).map(p=>p.value),[100]);assert.equal(rsi(candles([4,3,2,1]),3)[0].value,0);assert.equal(rsi(candles([2,2,2,2]),3)[0].value,50);
  const points=rsi(candles([1,2,1,3,2]),3);assert.equal(points[0].value,75);assert.ok(Math.abs(points[1].value-54.54545454545)<1e-8);assert.equal(points[0].time,1180);assert.deepEqual(rsi(candles([1,2,3]),3),[]);
});
test("indicator preferences persist, isolate owners, transfer guests once and reject stale writes",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-indicators-")),path=join(directory,"test.sqlite");let accounts=new AccountStore(path,false);
  try{
    let store=new IndicatorStore(accounts.db);const first=accounts.createGuest(),other=accounts.createGuest(),settings=defaultIndicators();settings.ema[0].enabled=true;settings.ema[0].period=35;settings.rsi.enabled=true;settings.volume=false;
    const mutationId=randomUUID();store.save(first.session.ownerId,{revision:0,settings,mutationId});assert.equal(store.save(first.session.ownerId,{revision:0,settings,mutationId}).revision,1);assert.deepEqual(store.read(other.session.ownerId).settings,defaultIndicators());
    assert.throws(()=>store.save(first.session.ownerId,{revision:0,settings,mutationId:randomUUID()}),DrawingConflict);
    const account=accounts.register("indicators@example.com","hash",first.session);assert.deepEqual(store.read(account.session.ownerId).settings,settings);
    const old=defaultIndicators();old.sma.enabled=true;store.save(other.session.ownerId,{revision:0,settings:old,mutationId:randomUUID()});accounts.login(account.session.user!.id,other.session);assert.deepEqual(store.read(account.session.ownerId).settings,settings,"Account settings win over temporary guest preferences");
    accounts.close();accounts=new AccountStore(path,false);store=new IndicatorStore(accounts.db);assert.deepEqual(store.read(account.session.ownerId).settings,settings);
    const invalid=defaultIndicators();invalid.ema[0].period=201;assert.equal(indicatorSettingsSchema.safeParse(invalid).success,false);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
