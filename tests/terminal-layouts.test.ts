import {test} from "node:test";
import assert from "node:assert/strict";
import {AccountStore} from "../lib/server/account-store";
import {WorkspaceStore} from "../lib/server/workspace-store";
import {DEFAULT_WORKSPACE,workspaceSettingsSchema,workspacePatchSchema} from "../lib/ui/workspace-settings";
import {captureLayout,applyLayout,layoutChanged,availableLayoutName,validateLayoutName} from "../lib/ui/terminal-layouts";
import {defaultScopedIndicators} from "../lib/indicators/scope";
const id="22222222-2222-4222-8222-222222222222";
test("layout snapshots exclude shared preferences and restore scoped drawings, indicators and panels",()=>{
  const indicators={...defaultScopedIndicators(),revision:1};
  const state={...DEFAULT_WORKSPACE,layoutIndicators:indicators,layoutDrawings:{"binance:spot:BTCUSDT":[{id,price:100,color:"#aabbcc"}]},marketWindow:{x:100,y:80,width:320,height:500},tradesDocked:true};
  const content=captureLayout(state);assert.equal("recentPairs"in content,false);assert.equal("favorites"in content.marketPanel,false);
  const lib={version:1 as const,standard:captureLayout(DEFAULT_WORKSPACE),activeId:id,items:[{id,name:"Обзор",content,savedAt:1}]};
  const current={...DEFAULT_WORKSPACE,marketPanel:{...DEFAULT_WORKSPACE.marketPanel,favorites:["bybit:spot:ETHUSDT"]},layouts:lib};
  const applied=applyLayout(current,content,id);
  assert.equal(applied.tradesDocked,true);assert.deepEqual(applied.layoutDrawings,state.layoutDrawings);assert.deepEqual(applied.layoutIndicators,indicators);assert.deepEqual(applied.marketWindow,state.marketWindow);
  assert.deepEqual(applied.marketPanel.favorites,current.marketPanel.favorites);assert.equal(applied.layoutGeneration,1);
  assert.equal(layoutChanged(captureLayout(applied),content),false);
  assert.equal(layoutChanged(captureLayout({...applied,timeframe:"5m"}),content),true);
  assert.equal(layoutChanged({...content,layoutIndicators:{...indicators,revision:2}},content),false);
  assert.deepEqual(workspaceSettingsSchema.parse(JSON.parse(JSON.stringify(applied))),applied);
  assert.equal("layouts"in workspacePatchSchema.parse({selected:"ETH"}),false);
});
test("layout names are trimmed, unique and get compact suggestions",()=>{
  const lib={version:1 as const,activeId:id,items:[{id,name:"Обзор",content:captureLayout(DEFAULT_WORKSPACE),savedAt:1}]};
  assert.throws(()=>validateLayoutName(lib," "));assert.throws(()=>validateLayoutName(lib,"x".repeat(61)));
  assert.throws(()=>validateLayoutName(lib,"ОБЗОР"),/\(2\)/);assert.equal(validateLayoutName(lib," Обзор ",id),"Обзор");
  assert.equal(availableLayoutName(lib,"Обзор"),"Обзор (2)");assert.throws(()=>validateLayoutName(lib,"Основной"));
});
test("old settings and damaged layout libraries recover without losing the selected instrument",()=>{
  const legacy:Record<string,unknown>={...DEFAULT_WORKSPACE,selected:"ETH"};delete legacy.layouts;delete legacy.layoutGeneration;
  assert.deepEqual(workspaceSettingsSchema.parse(legacy).layouts.items,[]);
  const corrupt=workspaceSettingsSchema.parse({...legacy,layouts:{version:99,items:"broken"}});
  assert.equal(corrupt.selected,"ETH");assert.deepEqual(corrupt.layouts.items,[]);
  assert.equal(workspaceSettingsSchema.parse({...legacy,layouts:{version:1,activeId:id,items:[]}}).layouts.activeId,null);
});
test("SQLite keeps saved layouts distinct from auto-saved drafts and isolates owners without schema changes",()=>{
  const accounts=new AccountStore(":memory:",false);try{
    const store=new WorkspaceStore(accounts.db),a=accounts.createGuest().session.ownerId,b=accounts.createGuest().session.ownerId;
    const content=captureLayout({...DEFAULT_WORKSPACE,selected:"ETH",timeframe:"5m"});
    store.save(a,{selected:"ETH",layouts:{version:1,activeId:id,standard:captureLayout(DEFAULT_WORKSPACE),items:[{id,name:"Анализ",content,savedAt:1}]}});
    store.save(a,{selected:"SOL",timeframe:"15m"});
    const reloaded=new WorkspaceStore(accounts.db).read(a).settings!;
    assert.equal(reloaded.selected,"SOL");assert.equal(reloaded.layouts.activeId,id);assert.equal(reloaded.layouts.items[0].content.selected,"ETH");assert.equal(reloaded.layouts.items[0].content.timeframe,"5m");
    assert.equal(store.read(b).settings,null);assert.throws(()=>store.save(a,{layouts:{version:2,items:[]}}));
  }finally{accounts.close();}
});
