import {test} from "node:test";
import assert from "node:assert/strict";
import {paperPortfolio,estimatePosition} from "../lib/paper/portfolio";
import type {PaperFill,PaperBalance,PaperOrder} from "../lib/paper/account";
import type {OrderBook} from "../lib/market/orderbook/model";
const balance=(currency:string,units:number,reserved=0):PaperBalance=>({currency,decimals:currency==="USDT"?6:8,availableUnits:units,reservedUnits:reserved});
const fill=(extra:Partial<PaperFill>={}):PaperFill=>({id:"fill",orderId:"order",exchange:"bybit",symbol:"HYPEUSDT",base:"HYPE",quote:"USDT",side:"buy",price:77.4,quantityAtoms:5e9,settlementCurrency:"USDT",settlementUnits:3870e6,feeUnits:3870000,createdAt:1,...extra});
const book=(extra:Partial<OrderBook>={}):OrderBook=>({exchange:"bybit",symbol:"HYPEUSDT",bids:[{price:78,quantity:20},{price:77.9,quantity:30}],asks:[{price:78.1,quantity:100}],receivedAt:Date.now(),exchangeTime:null,...extra});
test("basis includes actual execution fees and remaining HYPE stays on Bybit",()=>{
  const p=paperPortfolio([balance("HYPE",5e9),balance("USDT",16126130000)],[fill()],[]);
  assert.equal(p.positions[0].quantity,50);assert.equal(p.positions[0].exchange,"bybit");assert.equal(p.positions[0].cost,3873.87);assert.ok(Math.abs(p.positions[0].average-77.4774)<1e-10);assert.equal(p.venueBalances.find(b=>b.exchange==="bybit"&&b.currency==="HYPE")?.availableUnits,5e9);assert.equal(p.unassigned.find(b=>b.currency==="HYPE")?.availableUnits,0);
  const e=estimatePosition(p.positions[0],book());assert.equal(e.status,"ok");if(e.status!=="ok")return;assert.equal(e.net,3893.103);assert.ok(Math.abs(e.pnl-19.233)<1e-8);assert.ok(Math.abs(e.breakEven-77.4774/.999)<1e-10);
});
test("sale realizes FIFO basis with both fees and preserves basis of unsold coins",()=>{
  const sell=fill({id:"sell",side:"sell",quantityAtoms:1e9,price:80,settlementUnits:800e6,feeUnits:800000,createdAt:2});
  const p=paperPortfolio([balance("HYPE",4e9),balance("USDT",16925330000)],[fill(),sell],[]),position=p.positions[0];
  assert.equal(position.quantity,40);assert.ok(Math.abs(position.cost-3099.096)<1e-8);assert.ok(Math.abs(position.realized!-24.426)<1e-8);assert.equal(p.venueBalances.find(b=>b.exchange==="bybit"&&b.currency==="USDT")?.availableUnits,799200000);
});
test("reserved coins are excluded from executable PnL and unavailable to another venue",()=>{
  const order:PaperOrder={id:"sell",exchange:"bybit",symbol:"HYPEUSDT",side:"sell",orderType:"limit",status:"open",quantityAtoms:1e9,filledAtoms:0,limitPriceAtoms:null,createdAt:2,reservedCurrency:"HYPE",reservedUnits:1e9};
  const p=paperPortfolio([balance("HYPE",4e9,1e9),balance("USDT",16126130000)],[fill()],[order]);assert.equal(p.positions[0].quantity,50);assert.equal(p.positions[0].available,40);assert.equal(p.venueBalances.find(b=>b.exchange==="bybit"&&b.currency==="HYPE")?.reservedUnits,1e9);
  assert.deepEqual(paperPortfolio([balance("HYPE",4e9,1e9),balance("USDT",16126130000)],[fill()],[{...order,exchange:"binance"}]).blockedOrders,["sell"]);
});
test("depth, age, venue and currency mismatch never produce invented profit",()=>{
  const position=paperPortfolio([balance("HYPE",5e9),balance("USDT",0)],[fill()],[]).positions[0];
  assert.equal(estimatePosition(position,book({bids:[{price:100,quantity:2}]})).status,"depth");assert.equal(estimatePosition(position,book({receivedAt:Date.now()-6000})).status,"stale");assert.equal(estimatePosition(position,book({exchange:"binance"})).status,"stale");assert.equal(estimatePosition(position,book({exchangeTime:Date.now()-16000})).status,"stale");assert.equal(estimatePosition({...position,marketQuote:"BTC"},book()).status,"currency");
});
test("deposited coins have no invented acquisition price or profit",()=>{
  const p=paperPortfolio([balance("HYPE",5e9)],[],[]);assert.deepEqual(p.positions,[]);assert.equal(p.unassigned[0].availableUnits,5e9);
  const sold=paperPortfolio([balance("HYPE",4e9),balance("USDT",799200000)],[fill({side:"sell",quantityAtoms:1e9,settlementUnits:800e6,feeUnits:800000})],[]);assert.equal(sold.positions[0].realized,null);
});
