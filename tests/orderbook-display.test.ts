import {test} from "node:test";
import assert from "node:assert/strict";
import {displayBookLevels,bookAmount,bookNotional} from "../lib/market/orderbook/display";
import {workspaceSettingsSchema,workspacePatchSchema,DEFAULT_WORKSPACE} from "../lib/ui/workspace-settings";
test("book grouping rounds bids down and asks up using decimal units and sums actual notionals",()=>{
  const bids=[{price:2.3,quantity:2},{price:2.29,quantity:3}],asks=[{price:2.31,quantity:4},{price:2.39,quantity:5}];
  const groupedBids=displayBookLevels(bids,false,.1),groupedAsks=displayBookLevels(asks,true,.1);
  assert.equal(groupedBids[0].price,2.3);assert.equal(groupedBids[1].price,2.2);
  assert.equal(groupedAsks.length,1);assert.equal(groupedAsks[0].price,2.4);assert.equal(groupedAsks[0].quantity,9);
  assert.ok(Math.abs(groupedAsks[0].notional-(2.31*4+2.39*5))<1e-10);
  assert.notEqual(groupedAsks[0].notional,2.4*9);
  assert.deepEqual(bids,[{price:2.3,quantity:2},{price:2.29,quantity:3}]);
});
test("cumulative depth starts at the best price, retains displayed levels and handles tiny prices",()=>{
  const bids=displayBookLevels([{price:.00000123,quantity:2},{price:.00000122,quantity:3}],false,.00000001);
  assert.equal(bids[0].price,.00000123);assert.equal(bids[1].cumulativeQuantity,5);
  assert.ok(Math.abs(bids[1].cumulativeNotional-(.00000123*2+.00000122*3))<1e-15);
  assert.equal(displayBookLevels(Array.from({length:20},(_,i)=>({price:100-i,quantity:1})),false,0,5).length,5);
  assert.equal(bookAmount(6782.999999999999),"6 783");
  assert.equal(bookNotional(200.24691234,"USDT"),"200,25");assert.equal(bookNotional(.12345678,"BTC"),"0,12345678");assert.notEqual(bookNotional(.00000123,"USDT"),"0");
});
test("book preference migration preserves old floating mode and partial updates keep current settings",()=>{
  const {orderBookSettings,...old}=DEFAULT_WORKSPACE;void orderBookSettings;
  assert.equal(workspaceSettingsSchema.parse(old).orderBookSettings.mode,"floating");
  assert.equal(DEFAULT_WORKSPACE.orderBookSettings.mode,"docked");
  assert.deepEqual(workspacePatchSchema.parse({selected:"SOL"}),{selected:"SOL"});
  for(const bad of [{...DEFAULT_WORKSPACE.orderBookSettings,width:0},{...DEFAULT_WORKSPACE.orderBookSettings,priceSteps:{"binance:spot:BTCUSDT":-1}}])assert.equal(workspaceSettingsSchema.safeParse({...DEFAULT_WORKSPACE,orderBookSettings:bad}).success,false);
});
