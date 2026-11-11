import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AccountStore} from "../lib/server/account-store";
import {WorkspaceStore} from "../lib/server/workspace-store";
import {DEFAULT_GUEST_WORKSPACE,DEFAULT_WORKSPACE} from "../lib/ui/workspace-settings";
test("guest workspace opens order book, markets and public trades by default",()=>{
  assert.equal(DEFAULT_GUEST_WORKSPACE.orderBookOpen,true);
  assert.equal(DEFAULT_GUEST_WORKSPACE.marketsOpen,true);
  assert.equal(DEFAULT_GUEST_WORKSPACE.tradesOpen,true);
  assert.equal(DEFAULT_GUEST_WORKSPACE.tradesDocked,true);
  assert.equal(DEFAULT_GUEST_WORKSPACE.tradesTab,"all");
  assert.equal(DEFAULT_WORKSPACE.orderBookOpen,false);
  assert.equal(DEFAULT_WORKSPACE.tradesOpen,false);
});
test("account workspace persists pair, interval, open state and geometry; partial writes preserve unrelated fields and users",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-workspace-")),path=join(directory,"workspace.sqlite");let accounts=new AccountStore(path,false);
  try{
    let store=new WorkspaceStore(accounts.db);const a=accounts.createGuest().session.ownerId,b=accounts.createGuest().session.ownerId;
    assert.equal(store.read(a).settings,null);
    store.save(a,{exchange:"coinbase",selected:"ETH",timeframe:"1m",orderBookOpen:true});
    const geometry={x:123,y:98,width:320,height:450};store.save(a,{orderBookWindow:geometry});
    assert.equal(store.read(a).settings!.selected,"ETH");assert.equal(store.read(a).settings!.exchange,"coinbase");assert.equal(store.read(a).settings!.orderBookOpen,true);assert.deepEqual(store.read(a).settings!.orderBookWindow,geometry);
    assert.equal(store.read(b).settings,null);store.save(b,{selected:"SOL",orderBookOpen:false});
    store.save(a,{orderBookOpen:false});assert.deepEqual(store.read(a).settings!.orderBookWindow,geometry);assert.equal(store.read(b).settings!.selected,"SOL");
    store.save(a,{quote:"all",selectedQuote:"BTC"});store.save(a,{selected:"SOL"});
    const bookSettings={mode:"docked" as const,width:345,side:"buy" as const,bars:"cumulative" as const,levels:10 as const,priceSteps:{"binance:spot:BTCUSDT":.1,"coinbase:spot:BTC-USD":1}};store.save(a,{orderBookSettings:bookSettings});store.save(a,{orderBookOpen:true});
    assert.deepEqual(store.read(a).settings!.orderBookSettings,bookSettings);store.save(a,{orderBookOpen:false});
    const marketPanel={mode:"floating" as const,width:360,favoritesOnly:true,favorites:["binance:spot:SOLUSDT"]},marketWindow={x:55,y:120,width:360,height:580};
    store.save(a,{marketPanel,marketWindow,marketsOpen:false});store.save(a,{timeframe:"1h"});assert.deepEqual(store.read(a).settings!.marketPanel,marketPanel);assert.equal(store.read(b).settings!.marketsOpen,true);
    store.save(a,{tradesOpen:true,tradesWindow:geometry,tradesTab:"mine",tradesDocked:true,tradesSide:"left",tradesWidth:350,sidePanelOrder:"trades-first",sidePanelSplit:.35});store.save(a,{selected:"SOL"});assert.equal(store.read(a).settings!.tradesOpen,true);assert.equal(store.read(b).settings!.tradesOpen,false);assert.equal(store.read(b).settings!.sidePanelOrder,"markets-first");assert.equal(store.read(b).settings!.tradesSide,"auto");
    store.save(a,{orderDialogPosition:{x:420,y:180},profileDialogPosition:{x:80,y:110}});store.save(a,{selected:"SOL"});assert.equal(store.read(b).settings!.orderDialogPosition,null);assert.equal(store.read(b).settings!.profileDialogPosition,null);
    assert.equal(store.read(a).settings!.quote,"all");assert.equal(store.read(a).settings!.selectedQuote,"BTC");assert.equal(store.read(b).settings!.quote,"auto");
    for(const invalid of [{ownerId:b},{orderBookWindow:{...geometry,width:-1}},{orderBookOpen:"true"},{exchange:"fake"}])assert.throws(()=>store.save(a,invalid));
    accounts.close();accounts=new AccountStore(path,false);store=new WorkspaceStore(accounts.db);
    assert.equal(store.read(a).settings!.selected,"SOL");assert.equal(store.read(a).settings!.quote,"all");assert.equal(store.read(a).settings!.selectedQuote,"BTC");assert.equal(store.read(a).settings!.orderBookOpen,false);assert.deepEqual(store.read(a).settings!.orderBookWindow,geometry);
    assert.deepEqual(store.read(a).settings!.orderBookSettings,bookSettings);
    assert.deepEqual(store.read(a).settings!.marketPanel,marketPanel);assert.deepEqual(store.read(a).settings!.marketWindow,marketWindow);assert.equal(store.read(a).settings!.marketsOpen,false);
    assert.deepEqual(store.read(a).settings!.tradesWindow,geometry);assert.equal(store.read(a).settings!.tradesTab,"mine");assert.equal(store.read(a).settings!.tradesDocked,true);assert.equal(store.read(a).settings!.tradesWidth,350);
    assert.equal(store.read(a).settings!.sidePanelOrder,"trades-first");assert.equal(store.read(a).settings!.sidePanelSplit,.35);assert.throws(()=>store.save(a,{sidePanelSplit:1}));
    assert.equal(store.read(a).settings!.tradesSide,"left");
    assert.deepEqual(store.read(a).settings!.orderDialogPosition,{x:420,y:180});assert.deepEqual(store.read(a).settings!.profileDialogPosition,{x:80,y:110});assert.throws(()=>store.save(a,{profileDialogPosition:{x:NaN,y:10}}));
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
test("legacy global book step upgrades without losing layout and no longer blocks saves",()=>{
  const accounts=new AccountStore(":memory:",false);try{
    const owner=accounts.createGuest().session.ownerId,store=new WorkspaceStore(accounts.db),book:Record<string,unknown>={...DEFAULT_WORKSPACE.orderBookSettings,priceStep:.25};delete book.priceSteps;
    store.save(owner,{selected:"HYPE",orderBookOpen:true});accounts.db.prepare("UPDATE private_workspace_settings SET settings=? WHERE owner_id=?").run(JSON.stringify({...DEFAULT_WORKSPACE,selected:"HYPE",orderBookOpen:true,orderBookSettings:book}),owner);
    assert.equal(store.read(owner).settings!.orderBookSettings.priceSteps["legacy:default"],.25);
    store.save(owner,{profileDialogPosition:{x:700,y:120}});assert.equal(store.read(owner).settings!.selected,"HYPE");assert.equal(store.read(owner).settings!.orderBookOpen,true);assert.deepEqual(store.read(owner).settings!.profileDialogPosition,{x:700,y:120});
    const saved=JSON.parse(String(accounts.db.prepare("SELECT settings FROM private_workspace_settings WHERE owner_id=?").get(owner)!.settings));assert.equal("priceStep"in saved.orderBookSettings,false);assert.equal(saved.orderBookSettings.priceSteps["legacy:default"],.25);
    book.priceStep=0;accounts.db.prepare("UPDATE private_workspace_settings SET settings=? WHERE owner_id=?").run(JSON.stringify({...DEFAULT_WORKSPACE,orderBookSettings:book}),owner);assert.deepEqual(store.read(owner).settings!.orderBookSettings.priceSteps,{});store.save(owner,{selected:"SOL"});
  }finally{accounts.close();}
});
