import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_WORKSPACE} from "../lib/ui/workspace-settings";
import {captureLayout} from "../lib/ui/terminal-layouts";
import {mergeWindowWorkspace} from "../lib/ui/window-workspace";
import {AccountStore} from "../lib/server/account-store";
import {WorkspaceStore} from "../lib/server/workspace-store";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
test("remote refresh shares the library but preserves this window's selection and complete draft",()=>{
  const items=[{id:a,name:"BTC",content:captureLayout(DEFAULT_WORKSPACE),savedAt:1},{id:b,name:"ETH",content:captureLayout({...DEFAULT_WORKSPACE,exchange:"bybit",selected:"ETH"}),savedAt:1}];
  const local={...DEFAULT_WORKSPACE,selected:"SOL",timeframe:"5m" as const,marketsOpen:false,layouts:{version:1 as const,activeId:a,items}};
  const remote={...DEFAULT_WORKSPACE,exchange:"bybit" as const,selected:"ETH",timeframe:"15m" as const,marketPanel:{...DEFAULT_WORKSPACE.marketPanel,favorites:["bybit:spot:ETHUSDT"]},layouts:{version:1 as const,activeId:b,items:items.map(item=>item.id===b?{...item,name:"Обзор"}:item)}};
  const merged=mergeWindowWorkspace(local,remote);
  assert.equal(merged.layouts.activeId,a);assert.equal(merged.selected,"SOL");assert.equal(merged.timeframe,"5m");assert.equal(merged.exchange,"binance");assert.equal(merged.marketsOpen,false);
  assert.equal(merged.layouts.items[1].name,"Обзор");assert.deepEqual(merged.marketPanel.favorites,remote.marketPanel.favorites);
  const removed=mergeWindowWorkspace(local,{...remote,layouts:{...remote.layouts,items:[items[1]]}});
  assert.equal(removed.layouts.activeId,null);assert.equal(removed.selected,"SOL");
});
test("saving a window's selection never replaces another window's saved layout collection",()=>{
  const accounts=new AccountStore(":memory:",false);try{
    const store=new WorkspaceStore(accounts.db),owner=accounts.createGuest().session.ownerId;
    const items=[{id:a,name:"BTC",content:captureLayout(DEFAULT_WORKSPACE),savedAt:1},{id:b,name:"ETH",content:captureLayout({...DEFAULT_WORKSPACE,selected:"ETH"}),savedAt:1}];
    store.save(owner,{layouts:{version:1,activeId:a,items}});
    store.save(owner,{selected:"ETH"},b);
    assert.equal(store.read(owner).settings!.layouts.items.length,2);assert.equal(store.read(owner).settings!.layouts.activeId,b);
    store.save(owner,{timeframe:"5m"},a);
    assert.equal(store.read(owner).settings!.layouts.activeId,a);assert.equal(store.read(owner).settings!.layouts.items[1].name,"ETH");
  }finally{accounts.close();}
});
