import {test} from "node:test";
import assert from "node:assert/strict";
import {orderLevels} from "../lib/paper/order-levels";
import type {DemoOrder} from "../lib/paper/orders";
const order:DemoOrder={id:"order",accountId:"account",exchange:"kucoin",symbol:"BNB-USDT",base:"BNB",quote:"USDT",side:"buy",type:"limit",quantity:1e8,filled:0,limit:680.47,stop:null,direction:"up",triggered:true,bound:680.47,reserved:681150470,status:"open",createdAt:1,updatedAt:1,lastBook:0,fee:0,cost:0,note:""};
test("one pending order has one visible level and newer revisions replace duplicates",()=>{
  const levels=orderLevels([order,{...order,limit:685,updatedAt:2},order]);assert.equal(levels.length,1);assert.equal(levels[0].price,685);assert.equal(levels[0].kind,"limit");assert.deepEqual(orderLevels([{...order,status:"cancelled"}]),[]);
});
test("equal stop/limit prices merge; distinct trigger and limit remain distinct",()=>{
  const stop={...order,type:"stop_limit" as const,triggered:false,stop:680.47};assert.deepEqual(orderLevels([stop]).map(l=>l.kind),["stop_limit"]);assert.deepEqual(orderLevels([{...stop,stop:682}]).map(l=>[l.kind,l.price]),[["limit",680.47],["stop",682]]);assert.deepEqual(orderLevels([{...stop,triggered:true}]).map(l=>l.kind),["limit"]);
});
