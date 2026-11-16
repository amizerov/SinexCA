import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultIndicators,indicatorSettingsSchema,newEma} from "../lib/indicators/settings";
import {applyIndicatorEdit,resolveIndicators,defaultForAll,indicatorOverridesSchema} from "../lib/indicators/scope";
import {DEFAULT_WORKSPACE,workspaceSettingsSchema} from "../lib/ui/workspace-settings";
import {captureLayout,applyLayout} from "../lib/ui/terminal-layouts";
const btc={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT"};
test("ten EMA lines round-trip through scope settings and saved layouts",()=>{
  const global=defaultIndicators(),draft={...global,ema:Array.from({length:10},(_,i)=>({...newEma(i),period:10+i*10}))};
  const edit=applyIndicatorEdit(global,{},btc,draft,defaultForAll());
  assert.equal(edit.settings.ema.length,10);assert.equal(edit.settings.ema[9].period,100);
  const layout=captureLayout({...DEFAULT_WORKSPACE,layoutIndicators:{...edit,revision:1}});
  const restored=workspaceSettingsSchema.parse(JSON.parse(JSON.stringify(applyLayout(DEFAULT_WORKSPACE,layout,null))));
  assert.deepEqual(restored.layoutIndicators?.settings.ema,draft.ema);
});
test("a tenth EMA can be scoped to one pair and promoted without altering another pair",()=>{
  const global={...defaultIndicators(),ema:Array.from({length:10},(_,i)=>newEma(i))};
  const draft=structuredClone(global);draft.ema[9].period=150;
  const local=applyIndicatorEdit(global,{},btc,draft,{...defaultForAll(),ema9:false});
  assert.equal(resolveIndicators(local.settings,local.overrides,btc).settings.ema[9].period,150);
  assert.equal(resolveIndicators(local.settings,local.overrides,{...btc,symbol:"ETHUSDT"}).settings.ema[9].period,20);
  const promoted=applyIndicatorEdit(local.settings,local.overrides,btc,draft,{...defaultForAll(),ema9:true});
  assert.equal(promoted.settings.ema[9].period,150);assert.deepEqual(promoted.overrides,{});
});
test("EMA can be removed down to zero and old three-line documents remain valid",()=>{
  const global=defaultIndicators(),empty={...global,ema:[]};
  const result=applyIndicatorEdit(global,{},btc,empty,defaultForAll());
  assert.deepEqual(resolveIndicators(result.settings,result.overrides,btc).settings.ema,[]);
  assert.equal(indicatorSettingsSchema.parse(global).ema.length,3);
  assert.equal(indicatorSettingsSchema.safeParse({...global,ema:Array(101).fill(newEma(0))}).success,false);
  assert.equal(indicatorOverridesSchema.safeParse({ema9:12}).success,false);
  assert.equal(indicatorOverridesSchema.safeParse({ema100:newEma(0)}).success,false);
});
