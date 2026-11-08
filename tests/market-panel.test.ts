import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_WORKSPACE,workspaceSettingsSchema,workspacePatchSchema} from "../lib/ui/workspace-settings";
import {favoriteKey,marketPanelSettingsSchema} from "../lib/ui/market-panel-settings";
test("market panel defaults migrate without changing old preferences; partial patches never reset layout",()=>{
  const {marketPanel,marketWindow,marketsOpen,...legacy}=DEFAULT_WORKSPACE;void marketPanel;void marketWindow;void marketsOpen;
  const migrated=workspaceSettingsSchema.parse(legacy);assert.equal(migrated.marketPanel.mode,"right");assert.equal(migrated.marketWindow,null);assert.equal(migrated.marketsOpen,true);
  assert.deepEqual(workspacePatchSchema.parse({orderBookOpen:true}),{orderBookOpen:true});
  assert.equal(marketPanelSettingsSchema.safeParse({...migrated.marketPanel,width:20}).success,false);
});
test("favorite identity includes exchange, spot market and native symbol",()=>{
  const pair={exchange:"binance" as const,marketType:"spot" as const,symbol:"SOLUSDT",baseAsset:"SOL",quoteAsset:"USDT"};
  assert.notEqual(favoriteKey(pair),favoriteKey({...pair,exchange:"bybit"}));assert.notEqual(favoriteKey(pair),favoriteKey({...pair,symbol:"SOLBTC",quoteAsset:"BTC"}));
  assert.equal(favoriteKey(pair),"binance:spot:SOLUSDT");
});
