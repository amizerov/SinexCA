import {test} from "node:test";
import assert from "node:assert/strict";
import {dailyVwap,isVwapTimeframe,utcSession} from "../lib/indicators/vwap";
import {loadVwapSession} from "../lib/indicators/vwap-history";
import {defaultIndicators,indicatorSettingsSchema} from "../lib/indicators/settings";
import {defaultForAll,resolveIndicators,applyIndicatorEdit} from "../lib/indicators/scope";
import type {Candle} from "../lib/market/types";
const day=Date.UTC(2026,10,14)/1000;
const bar=(time:number,price:number,volume:number):Candle=>({time,open:price,high:price+3,low:price-3,close:price,volume});
test("HLC3 VWAP matches hand calculation and replaces a partial candle instead of adding its volume",()=>{
  const first=bar(day,10,2),second=bar(day+60,20,1),updated=bar(day+60,30,3);
  const original=dailyVwap([first,second],"1m")[0];assert.deepEqual(original.points.map(p=>p.value),[10,40/3]);
  const changed=dailyVwap([first,second,updated],"1m")[0];assert.deepEqual(changed.points.map(p=>p.value),[10,22]);assert.equal(changed.complete,true);
  assert.deepEqual(dailyVwap([updated,first],"1m"),dailyVwap([first,updated],"1m"));
  assert.equal(dailyVwap([first,second,bar(day+120,1000,999)],"1m")[0].points[1].value,40/3,"future bars cannot change prior values");
});
test("UTC rollover creates distinct sessions; zero volume never creates NaN, gaps and invalid data fail closed",()=>{
  const data=[bar(day,10,0),bar(day+60,20,2),bar(day+86400,30,5)];
  const sessions=dailyVwap(data,"1m");assert.equal(sessions.length,2);assert.deepEqual(sessions.map(s=>s.points.map(p=>p.value)),[[20],[30]]);
  assert.deepEqual(dailyVwap([],"1m"),[]);assert.deepEqual(dailyVwap([bar(day,10,0)],"1m")[0].points,[]);
  assert.equal(dailyVwap([bar(day+60,10,2)],"1m")[0].complete,false);
  assert.equal(dailyVwap([bar(day,10,2),bar(day+120,20,2)],"1m")[0].complete,false);
  assert.equal(dailyVwap([bar(day,10,-1)],"1m")[0].complete,false);
  assert.equal(dailyVwap([bar(day,10,NaN)],"1m")[0].complete,false);
  assert.deepEqual(dailyVwap(data,"1d"),[]);assert.equal(isVwapTimeframe("12h"),true);assert.equal(isVwapTimeframe("1w"),false);assert.equal(utcSession(day+86399),day);
});
test("session backfill reaches midnight beyond the visible chart and stops on providers without historical paging",async()=>{
  const source=Array.from({length:1440},(_,i)=>bar(day+i*60,10+i,1)),requests:number[]=[];
  const result=await loadVwapSession(async request=>{requests.push(request.endTime!);return source.filter(c=>c.time<=request.endTime!).slice(-request.limit);},"BTCUSDT","1m",day+86399,500);
  assert.equal(result.complete,true);assert.equal(result.candles.length,1440);assert.equal(requests.length,3);assert.equal(result.candles[0].time,day);
  const unavailable=await loadVwapSession(async()=>source.slice(-720),"XBTUSDT","1m",day+86399,720);assert.equal(unavailable.complete,false);assert.equal(unavailable.candles.length,720);
  assert.equal((await loadVwapSession(async()=>[],"BTCUSDT","1d",day)).complete,false);
});
test("old settings migrate safely; VWAP color/width and per-instrument visibility round trip",()=>{
  const old=structuredClone(defaultIndicators()) as Record<string,unknown>;delete old.vwap;
  assert.deepEqual(indicatorSettingsSchema.parse(old).vwap,defaultIndicators().vwap);
  const settings=defaultIndicators();settings.vwap={enabled:true,color:"#123456",width:3};
  assert.deepEqual(indicatorSettingsSchema.parse(JSON.parse(JSON.stringify(settings))).vwap,settings.vwap);
  const scope={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT"},edit=applyIndicatorEdit(defaultIndicators(),{},scope,settings,{...defaultForAll(),vwap:false});
  assert.equal(resolveIndicators(edit.settings,edit.overrides,scope).settings.vwap.enabled,true);
  assert.equal(resolveIndicators(edit.settings,edit.overrides,{...scope,symbol:"ETHUSDT"}).settings.vwap.enabled,false);
  assert.equal(indicatorSettingsSchema.safeParse({...settings,vwap:{...settings.vwap,width:10}}).success,false);
});
