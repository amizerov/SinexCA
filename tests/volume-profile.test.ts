import {test} from "node:test";
import assert from "node:assert/strict";
import {candleVolumeProfile} from "../lib/indicators/volume-profile";
import {loadProfileHistory,profileTimeframe} from "../lib/indicators/profile-history";
import {defaultIndicators,indicatorSettingsSchema} from "../lib/indicators/settings";
import {applyIndicatorEdit,defaultForAll,resolveIndicators} from "../lib/indicators/scope";
import {priceIncrement} from "../lib/market/price-increment";
import {recordRecentPair} from "../lib/ui/recent-pairs";
import type {Candle} from "../lib/market/types";
const c=(time:number,low:number,high:number,volume:number):Candle=>({time,low,high,open:low,close:high,volume});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test("profile conserves base volume, distributes by overlap and finds POC on aligned ticks",()=>{
  const p=candleVolumeProfile([c(0,10,15,100),c(60,12,13,30)],5,1);
  assert.deepEqual(p.bins.map(b=>b.volume),[20,20,50,20,20]);assert.equal(p.total,130);assert.equal(p.maximum,50);assert.equal(p.poc,2);
  assert.deepEqual(p.bins.map(b=>b.low),[10,11,12,13,14]);near(p.bins.reduce((s,b)=>s+b.volume,0),p.total);
  const fractional=candleVolumeProfile([c(0,.111,.143,7),c(60,.125,.125,3)],50,.005);
  near(fractional.total,10);near(fractional.bins.reduce((s,b)=>s+b.volume,0),10);
  for(const bin of fractional.bins)near(bin.low/.005,Math.round(bin.low/.005));
});
test("latest open-candle snapshots replace volume; flat prices and empty/invalid data are safe",()=>{
  const a=c(0,10,10,2),b=c(60,11,11,7),p=candleVolumeProfile([a,c(60,11,11,1),b,b],50,1);
  assert.equal(p.total,9);near(p.bins.reduce((s,b)=>s+b.volume,0),9);
  assert.equal(candleVolumeProfile([c(0,10,10,0)],50,.01).poc,null);
  assert.equal(candleVolumeProfile([],50,.01).total,0);
  assert.equal(candleVolumeProfile([c(0,NaN,12,2),c(1,10,9,3),c(2,10,11,-2)],50,1).total,0);
  assert.equal(candleVolumeProfile([a],50,0).bins.length,0);
});
test("history pages cover the entire interval, deduplicate and fail closed for missing day data",async()=>{
  const all=Array.from({length:1440},(_,i)=>c(i*60,10,11,1));let calls=0;
  const result=await loadProfileHistory(async request=>{calls++;return all.filter(c=>c.time<=(request.endTime??Infinity)).slice(-request.limit);},"BTCUSDT","1m",0,86400,500);
  assert.equal(calls,3);assert.equal(result.complete,true);assert.equal(result.candles.length,1440);
  assert.equal(candleVolumeProfile(result.candles,50,.01).total,1440);
  const capped=await loadProfileHistory(async()=>all.slice(-720),"BTCUSDT","1m",0,86400,720);assert.equal(capped.complete,false);
  const gap=await loadProfileHistory(async()=>all.filter(c=>c.time!==600),"BTCUSDT","1m",0,86400,2000);assert.equal(gap.complete,false);
  const nextDay=await loadProfileHistory(async()=>all,"BTCUSDT","1m",86400,172800);assert.equal(nextDay.candles.length,0);assert.equal(nextDay.complete,false);
  assert.equal(profileTimeframe("binance","1h",86400),"1m");assert.equal(profileTimeframe("binance","1s",300),"1s");
});
test("profile settings migrate old documents, round-trip and isolate symbols/exchanges",()=>{
  const original=defaultIndicators(),old={...original} as Partial<typeof original>;delete old.profile;
  assert.deepEqual(indicatorSettingsSchema.parse(old).profile,original.profile);
  const draft=structuredClone(original);draft.profile={...draft.profile,enabled:true,side:"right",width:25,levels:75};
  const scope={exchange:"cryptocom" as const,marketType:"spot" as const,symbol:"BTC_USDT"};
  const saved=applyIndicatorEdit(original,{},scope,draft,{...defaultForAll(),profile:false});
  const serialized=JSON.parse(JSON.stringify(saved));
  assert.equal(resolveIndicators(serialized.settings,serialized.overrides,scope).settings.profile.width,25);
  assert.equal(resolveIndicators(serialized.settings,serialized.overrides,{...scope,symbol:"ETH_USDT"}).settings.profile.enabled,false);
  assert.equal(resolveIndicators(serialized.settings,serialized.overrides,{...scope,exchange:"gate"}).settings.profile.enabled,false);
  assert.equal(indicatorSettingsSchema.safeParse({...draft,profile:{...draft.profile,width:31}}).success,false);
});
test("instrument tick comes from public metadata, never from the last candle price",()=>{
  assert.equal(priceIncrement("binance",{filters:[{filterType:"PRICE_FILTER",tickSize:"0.01"}]}).priceIncrement,.01);
  assert.equal(priceIncrement("cryptocom",{price_tick_size:"0.0001"}).priceIncrement,.0001);
  assert.equal(priceIncrement("bybit",{priceFilter:{tickSize:"0.1"}}).priceIncrement,.1);
  assert.equal(priceIncrement("gate",{precision:3}).priceIncrement,.001);
  assert.equal(priceIncrement("mexc",{quotePrecision:2}).priceIncrement,.01);
  assert.deepEqual(priceIncrement("bitfinex",{}),{});assert.deepEqual(priceIncrement("cryptocom",{price_tick_size:0}),{});
  const recent=recordRecentPair([],{exchange:"binance",marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT",priceIncrement:.01});
  assert.equal(recent.length,1);assert.equal(Object.hasOwn(recent[0],"priceIncrement"),false);
});
