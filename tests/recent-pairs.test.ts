import {test} from "node:test";
import assert from "node:assert/strict";
import {recordRecentPair,recentPairsSchema} from "../lib/ui/recent-pairs";
import {workspaceSettingsSchema,DEFAULT_WORKSPACE,chartViewsSchema} from "../lib/ui/workspace-settings";
import type {TradingPair} from "../lib/market/types";
const pair=(symbol:string,exchange:TradingPair["exchange"]="binance"):TradingPair=>({exchange,marketType:"spot",symbol,baseAsset:symbol,quoteAsset:"USDT"});
test("history keeps 30 unique instruments, moves revisits first and separates exchanges",()=>{
  let history:TradingPair[]=[];
  for(let i=0;i<35;i++)history=recordRecentPair(history,pair(String(i)));
  assert.equal(history.length,30);assert.equal(history.at(-1)!.symbol,"5");
  history=recordRecentPair(history,pair("20"));assert.equal(history[0].symbol,"20");assert.equal(history.length,30);
  history=recordRecentPair(history,pair("20","bybit"));assert.equal(history[0].exchange,"bybit");assert.equal(history[1].exchange,"binance");
  assert.deepEqual(recentPairsSchema.parse([pair("BTC"),pair("BTC")]),[pair("BTC")]);
  assert.throws(()=>recentPairsSchema.parse([{...pair("BTC"),secret:"private"}]));
});
test("legacy settings migrate to v2 and round trip without losing favorites",()=>{
  const legacy:Record<string,unknown>={...DEFAULT_WORKSPACE,selected:"ETH",timeframe:"5m"};
  delete legacy.schemaVersion;delete legacy.recentPairs;delete legacy.chartViews;
  const upgraded=workspaceSettingsSchema.parse(legacy);
  assert.equal(upgraded.schemaVersion,2);assert.equal(upgraded.selected,"ETH");assert.deepEqual(upgraded.recentPairs,[]);
  const settings={...upgraded,recentPairs:[pair("BTC")],chartViews:{"binance:spot:BTCUSDT:5m":{from:100,to:200}}};
  assert.deepEqual(workspaceSettingsSchema.parse(JSON.parse(JSON.stringify(settings))),settings);
  assert.throws(()=>workspaceSettingsSchema.parse({...settings,schemaVersion:99}));
  assert.throws(()=>workspaceSettingsSchema.parse({...settings,recentPairs:"broken"}));
  assert.throws(()=>chartViewsSchema.parse({bad:{from:200,to:100}}));
  assert.throws(()=>chartViewsSchema.parse(Object.fromEntries(Array.from({length:101},(_,i)=>[String(i),{from:100,to:200}]))));
});
