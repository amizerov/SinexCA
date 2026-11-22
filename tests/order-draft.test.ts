import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {orderDraftCalculations,validateOrderDraft,validateInstrumentOrder,decimalMultiple,orderPreferencesKey,PAPER_CAPABILITIES,type OrderFormDraft} from "../lib/paper/order-draft";
import {orderInput} from "../lib/paper/orders";
import {instrumentMetadata} from "../lib/market/instrument-metadata";
import type {TradingPair} from "../lib/market/types";
const pair:TradingPair={exchange:"binance",marketType:"futures",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT",contractSize:.001,priceIncrement:.1,futuresInfo:{kind:"perpetual",contractSize:.001,contractSizeUnit:"BTC",maxLeverage:20,minQuantity:.001,quantityStep:.001}};
const draft:OrderFormDraft={side:"buy",type:"limit",quantity:"2",limit:"100",stop:"105",stopLoss:"90",takeProfit:"120",leverage:5,margin:"isolated"};
test("long and short training calculations separate notional, margin and unlevered price PnL",()=>{
  const frozen=structuredClone(pair),before=JSON.stringify(frozen),long=orderDraftCalculations(frozen,draft,110);
  assert.equal(long.notional,200);assert.equal(long.initialMargin,40);assert.equal(long.risk,20);assert.equal(long.reward,40);assert.equal(long.ratio,2);assert.equal(long.contracts,2000);assert.equal(long.entryFee,undefined);
  const leveraged=orderDraftCalculations(frozen,{...draft,leverage:10},110);assert.equal(leveraged.initialMargin,20);assert.equal(leveraged.risk,long.risk);assert.equal(leveraged.reward,long.reward);
  const short=orderDraftCalculations(frozen,{...draft,side:"sell",stopLoss:"110",takeProfit:"80"},100);assert.equal(short.risk,20);assert.equal(short.reward,40);assert.equal(short.ratio,2);
  assert.equal(JSON.stringify(frozen),before,"Calculations cannot mutate contract metadata");
});
test("market uses its own instrument reference; stop-market uses the trigger price",()=>{
  assert.equal(orderDraftCalculations(pair,{...draft,type:"market"},105).notional,210);
  assert.equal(orderDraftCalculations(pair,{...draft,type:"stop_market"},80).entry,105);
  assert.equal(orderDraftCalculations({...pair,futuresInfo:undefined},draft,100).contracts,undefined,"Internal volume multipliers are not invented contract specifications");
  assert.equal(orderDraftCalculations(pair,{...draft,quantity:""},100).notional,undefined);
  assert.equal(orderDraftCalculations({...pair,marketType:"spot"},draft,100).entryFee,.2);
});
test("exact decimal lot and price checks handle large quantities and fractional contracts",()=>{
  assert.equal(decimalMultiple("0.003",.001),true);assert.equal(decimalMultiple("0.0015",.001),false);assert.equal(decimalMultiple("1000000.00000001",.001),false);assert.equal(decimalMultiple("0.00000003",1e-8),true);
  assert.match(validateOrderDraft(pair,{...draft,quantity:"0.0005"},100),/Минимальное/);
  assert.match(validateOrderDraft(pair,{...draft,quantity:"0.0015"},100),/Шаг количества/);
  assert.match(validateOrderDraft(pair,{...draft,limit:"100.05"},100),/Шаг цены/);
  assert.match(validateOrderDraft(pair,{...draft,leverage:21},100),/плечо/);
  assert.match(validateOrderDraft(pair,{...draft,stopLoss:"110"},100),/Стоп-лосс/);
  assert.match(validateOrderDraft(pair,{...draft,takeProfit:"80"},100),/Тейк-профит/);
  assert.equal(validateOrderDraft(pair,draft,100),"");
});
test("spot keeps its existing API types and rejects derivatives and unsupported attached exits",()=>{
  const input={mutationId:randomUUID(),exchange:"binance",symbol:"BTCUSDT",side:"buy",type:"limit",quantity:"1",limit:100};
  assert.equal(orderInput.safeParse(input).success,true);assert.equal(orderInput.safeParse({...input,marketType:"spot"}).success,true);
  assert.equal(orderInput.safeParse({...input,marketType:"futures"}).success,false);assert.equal(orderInput.safeParse({...input,stopLoss:90,takeProfit:120}).success,false);
  assert.equal(PAPER_CAPABILITIES.futures.available,false);assert.deepEqual(PAPER_CAPABILITIES.futures.types,["market","limit"]);
  assert.equal(PAPER_CAPABILITIES.spot.types.length,4);
  assert.notEqual(orderPreferencesKey("alice","spot"),orderPreferencesKey("alice","futures"));assert.notEqual(orderPreferencesKey("alice","spot"),orderPreferencesKey("bob","spot"));
});
test("spot catalog quantity/notional constraints are enforced independently from futures limits",()=>{
  const metadata=instrumentMetadata("binance",{filters:[{filterType:"LOT_SIZE",minQty:"0.01",maxQty:"10",stepSize:"0.01"},{filterType:"PRICE_FILTER",tickSize:"0.1"},{filterType:"MIN_NOTIONAL",minNotional:"5"}]});
  const spot:TradingPair={...pair,marketType:"spot",...metadata};
  assert.match(validateInstrumentOrder(spot,"0.01",100),/Минимальная сумма/);
  assert.match(validateInstrumentOrder(spot,"11",100),/Максимальное количество/);
  assert.match(validateInstrumentOrder(spot,"0.051",100),/Шаг количества/);
  assert.equal(validateInstrumentOrder(spot,"0.05",100),"");
});
