import {test} from "node:test";
import assert from "node:assert/strict";
import {findCoinListings} from "../lib/market/coin-listings";
import {EXCHANGE_IDS} from "../lib/market/exchange-config";
test("coin listings check all connected exchanges, retain native pairs and distinguish failures from absent listings",async()=>{
  const checked:string[]=[];
  const data=await findCoinListings("CRV",async exchange=>{
    checked.push(exchange);
    if(exchange==="gate")throw new Error("Network outage");
    if(!["okx","coinbase"].includes(exchange))return [];
    return [{exchange,marketType:"spot",baseAsset:"CRV",quoteAsset:exchange==="coinbase"?"USD":"USDT",symbol:exchange==="coinbase"?"CRV-USD":"CRV-USDT"}];
  });
  assert.deepEqual(checked,[...EXCHANGE_IDS]);assert.deepEqual(data.unavailable,["gate"]);
  assert.deepEqual(data.listings.map(listing=>listing.exchange),["okx","coinbase"]);
  assert.ok(data.listings[1].url.endsWith("CRV-USD"));assert.equal(data.listings[0].pair.symbol,"CRV-USDT");
});
