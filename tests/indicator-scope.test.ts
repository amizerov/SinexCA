import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {defaultIndicators} from "../lib/indicators/settings";
import {applyIndicatorEdit,resolveIndicators,defaultForAll,indicatorScopeKey,type IndicatorScope} from "../lib/indicators/scope";
import {AccountStore} from "../lib/server/account-store";
import {IndicatorStore} from "../lib/server/indicator-store";
import {DrawingConflict} from "../lib/server/drawing-store";
const btc:IndicatorScope={exchange:"binance",marketType:"spot",symbol:"BTCUSDT"},eth:IndicatorScope={...btc,symbol:"ETHUSDT"},bybit:IndicatorScope={...btc,exchange:"bybit"};
test("per-indicator flags customize one instrument while preserving global settings elsewhere",()=>{
  const global=defaultIndicators();global.ema[0].enabled=true;global.ema[1].enabled=true;
  const draft=structuredClone(global);draft.ema[0].period=42;
  const edit=applyIndicatorEdit(global,{},btc,draft,{...defaultForAll(),ema0:false});
  assert.equal(resolveIndicators(edit.settings,edit.overrides,btc).settings.ema[0].enabled,true);
  assert.equal(resolveIndicators(edit.settings,edit.overrides,btc).settings.ema[0].period,42);
  for(const scope of [eth,bybit]){const resolved=resolveIndicators(edit.settings,edit.overrides,scope);assert.equal(resolved.settings.ema[0].enabled,true);assert.equal(resolved.settings.ema[0].period,20);assert.equal(resolved.settings.ema[1].enabled,true);}
  assert.equal(resolveIndicators(edit.settings,edit.overrides,btc).forAll.ema0,false);
  assert.equal(global.ema[0].enabled,true,"The input document is never mutated");
  const promoted=applyIndicatorEdit(edit.settings,edit.overrides,btc,global,defaultForAll());
  assert.equal(resolveIndicators(promoted.settings,promoted.overrides,eth).settings.ema[0].enabled,true);
  assert.deepEqual(promoted.overrides,{});
});
test("editing one line preserves unrelated local settings on other instruments and treats false volume as an override",()=>{
  let doc={settings:defaultIndicators(),overrides:{}};
  const ethDraft=defaultIndicators();ethDraft.rsi.enabled=true;ethDraft.volume=false;
  doc=applyIndicatorEdit(doc.settings,doc.overrides,eth,ethDraft,{...defaultForAll(),rsi:false,volume:false});
  const btcDraft=defaultIndicators();btcDraft.ema[0].enabled=true;
  doc=applyIndicatorEdit(doc.settings,doc.overrides,btc,btcDraft,defaultForAll());
  const resolved=resolveIndicators(doc.settings,doc.overrides,eth);
  assert.equal(resolved.settings.rsi.enabled,true);assert.equal(resolved.settings.volume,false);assert.equal(resolved.forAll.volume,false);assert.equal(resolved.settings.ema[0].enabled,true);
});
test("SQLite retains scoped settings across restart, owner isolation and guest registration, with revision conflict checks",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-scope-")),path=join(directory,"test.sqlite");let accounts=new AccountStore(path,false);
  try{
    let store=new IndicatorStore(accounts.db);const guest=accounts.createGuest(),other=accounts.createGuest(),draft=defaultIndicators();draft.ema[0].enabled=true;draft.ema[0].period=42;
    const body={revision:0,settings:draft,mutationId:randomUUID(),scope:btc,forAll:{...defaultForAll(),ema0:false}};
    const saved=store.save(guest.session.ownerId,body);assert.equal(saved.overrides[indicatorScopeKey(btc)].ema0?.period,42);
    assert.equal(store.save(guest.session.ownerId,body).revision,1);
    assert.throws(()=>store.save(guest.session.ownerId,{...body,mutationId:randomUUID()}),DrawingConflict);
    assert.deepEqual(store.read(other.session.ownerId).overrides,{});
    // Legacy global writes leave all individual settings intact.
    const global=defaultIndicators();global.sma.enabled=true;
    const updated=store.save(guest.session.ownerId,{revision:1,settings:global,mutationId:randomUUID()});assert.equal(updated.overrides[indicatorScopeKey(btc)].ema0?.period,42);
    const registered=accounts.register("scope@example.com","hash",guest.session);assert.equal(store.read(registered.session.ownerId).overrides[indicatorScopeKey(btc)].ema0?.period,42);
    accounts.close();accounts=new AccountStore(path,false);store=new IndicatorStore(accounts.db);
    const restored=store.read(registered.session.ownerId);assert.equal(resolveIndicators(restored.settings,restored.overrides,btc).settings.ema[0].period,42);assert.equal(restored.settings.sma.enabled,true);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
