import {test} from "node:test";
import assert from "node:assert/strict";
import {HeatBook} from "../lib/market/heatmap/book";
import {defaultHeatmap} from "../lib/market/heatmap/settings";
import {DEFAULT_WORKSPACE,workspaceSettingsSchema,workspacePatchSchema} from "../lib/ui/workspace-settings";
import {captureLayout,applyLayout,layoutChanged} from "../lib/ui/terminal-layouts";
import {heatmapTimeCoordinate} from "../lib/market/heatmap/primitive";
import {SnapshotHeatmap,largestLiquidity} from "../lib/market/heatmap/snapshots";

test("sub-candle heatmap times interpolate integer pixel coordinates, including after the last candle",()=>{
  const candles=[100,160,220].map(time=>({time,open:1,high:2,low:1,close:2,volume:1}));
  const convert=(index:number)=>{assert.equal(Number.isInteger(index),true,"The chart rejects fractional logical indices");return 10+index*20;};
  assert.equal(heatmapTimeCoordinate(130000,candles,convert),20);
  assert.equal(heatmapTimeCoordinate(235000,candles,convert),55);
  assert.equal(heatmapTimeCoordinate(70000,candles,convert),0);
  assert.equal(heatmapTimeCoordinate(160000,candles,convert),30);
  assert.equal(heatmapTimeCoordinate(160000,[],convert),null);
});

const snapshot=()=>({lastUpdateId:100,bids:[[100,2],[99,4],[98,1]],asks:[[101,3],[102,4],[103,1]]});
test("snapshot history records published depth only and resets age after missing coverage",()=>{
  const history=new SnapshotHeatmap();
  const book={exchange:"bybit" as const,symbol:"BTCUSDT",bids:[{price:100,quantity:2},{price:99,quantity:4}],asks:[{price:101,quantity:3}],receivedAt:1000,exchangeTime:null};
  const first=history.slice(book,1000),second=history.slice(book,2000);
  assert.equal(first.cells.length,3);assert.equal(second.cells[0].since,1000);
  assert.deepEqual(largestLiquidity(second).map(c=>[c.side,c.price,c.notional]),[["bid",99,396],["ask",101,303]]);
  assert.deepEqual(largestLiquidity(second,5),[]);
  assert.equal(history.slice({...book,bids:[{price:100,quantity:2}]},3000).cells.length,2);
  assert.equal(history.slice(book,10000).cells[0].since,10000);
});
test("depth bridges snapshot, ignores duplicate events and rejects a missing sequence",()=>{
  const book=new HeatBook();book.snapshot(snapshot(),1000);
  assert.equal(book.update({U:99,u:101,b:[[100,5]],a:[]},2000),true);
  assert.equal(book.bids.get(100)?.quantity,5);assert.equal(book.bids.get(100)?.since,1000);
  assert.equal(book.update({U:99,u:101,b:[[100,99]],a:[]},2000),false);
  assert.throws(()=>book.update({U:103,u:104,b:[],a:[]},3000),/gap/);
});
test("zero deletes liquidity, a reappearing level starts a new observed age, history is immutable",()=>{
  const book=new HeatBook();book.snapshot(snapshot(),1000);const old=book.slice(2000);
  book.update({U:101,u:101,b:[[100,0]],a:[]},2500);
  assert.equal(book.slice(3000).cells.some(c=>c.side==="bid"&&Math.abs(c.price-100)<book.step/2),false);
  assert.equal(old.cells.find(c=>c.side==="bid"&&Math.abs(c.price-100)<book.step/2)?.notional,200);
  book.update({U:102,u:102,b:[[100,3]],a:[]},4000);
  assert.equal(book.bids.get(100)?.since,4000);
  assert.equal(book.slice(5000).end,6000);
});
test("unknown outer depth stays excluded and crossed books force resynchronization",()=>{
  const book=new HeatBook();book.snapshot(snapshot(),1000);
  book.update({U:101,u:101,b:[[50,100]],a:[[200,100]]},2000);
  assert.equal(book.bids.has(50),false);assert.equal(book.asks.has(200),false);
  assert.throws(()=>book.update({U:102,u:102,b:[[102,1]],a:[]},3000),/coverage/);
  book.snapshot(snapshot(),4000);assert.equal(book.sequence,100);assert.equal(book.bids.get(100)?.since,4000);
});
test("separate layouts restore enabled state, palette, opacity and persistence; old layouts default off",()=>{
  const plain=captureLayout(DEFAULT_WORKSPACE);
  const enabled={...DEFAULT_WORKSPACE,heatmap:{...defaultHeatmap(),enabled:true,opacity:65,persistence:30 as const,palette:"green" as const}};
  const saved=captureLayout(enabled);assert.equal(layoutChanged(saved,plain),true);
  const applied=applyLayout(DEFAULT_WORKSPACE,saved,null);assert.deepEqual(applied.heatmap,enabled.heatmap);
  assert.deepEqual(applyLayout(applied,plain,null).heatmap,defaultHeatmap());
  const legacy:Record<string,unknown>={...DEFAULT_WORKSPACE};delete legacy.heatmap;
  assert.deepEqual(workspaceSettingsSchema.parse(legacy).heatmap,defaultHeatmap());
  assert.throws(()=>workspacePatchSchema.parse({heatmap:{...defaultHeatmap(),opacity:500}}));
  assert.deepEqual(workspacePatchSchema.parse({selected:"SOL"}),{selected:"SOL"});
});
