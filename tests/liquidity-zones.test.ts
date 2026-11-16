import {test} from "node:test";
import assert from "node:assert/strict";
import {liquidityZones} from "../lib/market/heatmap/zones";
const candles=(values:number[],step=60)=>values.map((close,i)=>({time:i*step,open:close,high:close+1,low:close-1,close,volume:1}));

test("zones appear at pivot confirmation, never at the earlier pivot candle",()=>{
  const source=candles([10,11,15,11,10,9]);
  assert.deepEqual(liquidityZones(source.slice(0,5),2),[]);
  const zones=liquidityZones(source,2);assert.equal(zones.length,1);
  assert.equal(zones[0].side,"resistance");assert.equal(zones[0].confirmedAt,240);
  assert.ok(zones[0].lower<16&&zones[0].upper>16);
});
test("unclosed candles do not create, invalidate or move zones",()=>{
  const source=candles([10,11,15,11,10,9,8,9,10,11]);
  const expected=liquidityZones(source,2);
  assert.deepEqual(liquidityZones([...source.slice(0,-1),{...source.at(-1)!,high:1000,low:0,close:999}],2),expected);
});
test("a confirmed closing break ends a zone without extending it through the break",()=>{
  const source=candles([10,11,15,11,10,9,8,9,10,11,12,18,19]);
  const zones=liquidityZones(source,2),resistance=zones.find(z=>z.side==="resistance");
  assert.equal(resistance?.endedAt,660);
  assert.ok(zones.some(z=>z.side==="support"&&z.endedAt===undefined));
});
test("zones work on minute and hourly bars with the same relative confirmations",()=>{
  const values=[10,11,15,11,10,9,8,9,10,11];
  const minute=liquidityZones(candles(values,60),2),hour=liquidityZones(candles(values,3600),2);
  assert.deepEqual(hour.map(z=>({...z,confirmedAt:z.confirmedAt/60})),minute);
  assert.deepEqual(liquidityZones(candles(Array(30).fill(10))),[]);
  assert.throws(()=>liquidityZones([],1));
});
