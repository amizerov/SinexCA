import {test} from "node:test";
import assert from "node:assert/strict";
import {futuresPairs,futuresTickers} from "../lib/market/exchanges/futures-normalize";
import {bookProtocol} from "../lib/market/orderbook/protocols";
import {binanceTrades} from "../lib/market/trades/binance";
import {bybitTrades} from "../lib/market/trades/bybit";
import {okxTrades} from "../lib/market/trades/okx";
import {decodeForeignStream,streamSettings} from "../lib/market/stream";
import {candleQuery} from "../lib/market/schemas";
import {DEFAULT_WORKSPACE,workspacePatchSchema,workspaceSettingsSchema,normalizeWorkspace} from "../lib/ui/workspace-settings";
import {indicatorScopeKey,indicatorScopeSchema} from "../lib/indicators/scope";
import {drawingScopeSchema,scopeKey} from "../lib/drawings/types";
import type {TradingPair} from "../lib/market/types";

const binance:TradingPair={exchange:"binance",marketType:"futures",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"};
const bybit:TradingPair={...binance,exchange:"bybit"};
const okx:TradingPair={...binance,exchange:"okx",symbol:"BTC-USDT-SWAP",contractSize:.01};
const signal=new AbortController().signal;

test("futures catalogs retain only active USDT perpetuals with native price ticks",()=>{
  const row={symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT",status:"TRADING",contractType:"PERPETUAL",filters:[{filterType:"PRICE_FILTER",tickSize:"0.1"}]};
  const pairs=futuresPairs("binance",{symbols:[row,{...row,symbol:"BTCUSDT_261225",contractType:"CURRENT_QUARTER"},{...row,quoteAsset:"USDC"},{...row,status:"SETTLING"}]});
  assert.equal(pairs.length,1);assert.equal(pairs[0].marketType,"futures");assert.equal(pairs[0].priceIncrement,.1);
  const linear={symbol:"BTCUSDT",baseCoin:"BTC",quoteCoin:"USDT",settleCoin:"USDT",status:"Trading",contractType:"LinearPerpetual"};
  assert.equal(futuresPairs("bybit",{retCode:0,result:{list:[linear,{...linear,settleCoin:"USDC"},{...linear,contractType:"LinearFutures"}]}}).length,1);
  const swap={instId:okx.symbol,ctValCcy:"BTC",settleCcy:"USDT",state:"live",instType:"SWAP",ctType:"linear",ctVal:"0.01",tickSz:"0.1"};
  assert.equal(futuresPairs("okx",{code:"0",data:[swap,{...swap,ctType:"inverse"} ]})[0].contractSize,.01);
  assert.throws(()=>futuresPairs("okx",{code:"0",data:[{...swap,ctVal:""}]}));
});

test("futures ticker units distinguish base volume from contracts and quote turnover",()=>{
  const [ticker]=futuresTickers("okx",{code:"0",data:[{instId:okx.symbol,last:"100",open24h:"80",volCcy24h:"12",vol24h:"1200",bidPx:"99",askPx:"101",bidSz:"30",askSz:"20",high24h:"110",low24h:"70",ts:1000}]},[okx]);
  assert.equal(ticker.baseVolume24h,12);assert.equal(ticker.quoteVolume24h,null);assert.equal(ticker.bidSize,.3);assert.equal(ticker.askSize,.2);assert.equal(ticker.priceChangePercent24h,25);
  const [b]=futuresTickers("binance",[{symbol:"BTCUSDT",lastPrice:"100",priceChangePercent:"2",quoteVolume:"1000",volume:"10",highPrice:"110",lowPrice:"90",closeTime:1000}],[binance]);
  assert.equal(b.lastPrice,100);assert.equal(b.bid,null);assert.equal(b.quoteVolume24h,1000);
});

test("futures depth uses the public futures endpoint, validates the symbol and converts OKX contracts",async()=>{
  const protocol=(await bookProtocol(binance,signal))!;
  assert.match(protocol.url,/fstream\.binance\.com\/public\/ws\//);
  assert.equal(protocol.decode({e:"depthUpdate",s:"ETHUSDT",b:[[100,1]],a:[[101,2]]}),undefined);
  assert.equal(protocol.decode({e:"depthUpdate",s:"BTCUSDT",b:[[100,1]],a:[[101,2]],E:1000})?.bids[0].quantity,1);
  assert.match((await bookProtocol(bybit,signal))!.url,/\/linear$/);
  const book=(await bookProtocol(okx,signal))!.decode({arg:{channel:"books5",instId:okx.symbol},action:"snapshot",data:[{bids:[[100,50]],asks:[[101,20]],ts:1000}]});
  assert.equal(book?.bids[0].quantity,.5);assert.equal(book?.asks[0].quantity,.2);
});

test("futures trades use aggregate trades on Binance and linear streams on Bybit",async()=>{
  const protocol=await binanceTrades([binance],signal);
  assert.match(protocol.url,/\/market\/stream$/);assert.match(JSON.stringify(protocol.subscriptions),/@aggTrade/);
  assert.equal(protocol.decode({data:{e:"aggTrade",s:"BTCUSDT",p:100,q:2,T:1000,m:true,a:123}})[0].id,"123");
  assert.equal(protocol.decode({data:{e:"trade",s:"BTCUSDT",p:100,T:1000}}).length,0);
  assert.match((await bybitTrades([bybit],signal)).url,/\/linear$/);
  const swap=await okxTrades([okx],signal);
  assert.equal(swap.decode({arg:{channel:"trades",instId:okx.symbol},data:[{instId:okx.symbol,px:100,sz:25,ts:1000,side:"buy",tradeId:"a"}]})[0].quantity,.25);
});

test("futures candles use base volume on OKX and reject unsupported Binance seconds",()=>{
  assert.match(streamSettings("bybit",{symbol:"BTCUSDT",timeframe:"1m",marketType:"futures"}).url,/\/linear$/);
  const candle=decodeForeignStream("okx",{arg:{channel:"candle1m",instId:okx.symbol},data:[[60000,10,12,9,11,200,.5,5.5,"1"]]},{symbol:okx.symbol,timeframe:"1m",marketType:"futures"}).candle;
  assert.equal(candle?.volume,.5);
  assert.equal(candleQuery.safeParse({symbol:"BTCUSDT",marketType:"futures",timeframe:"1s"}).success,false);
  assert.equal(candleQuery.safeParse({symbol:"BTCUSDT",marketType:"spot",timeframe:"1s"}).success,true);
  assert.equal(candleQuery.safeParse({symbol:"BTCUSDT",marketType:"invalid"}).success,false);
});

test("partial workspace changes never reset futures; old settings default to spot",()=>{
  assert.deepEqual(workspacePatchSchema.parse({selected:"ETH"}),{selected:"ETH"});
  const futures=workspaceSettingsSchema.parse({...DEFAULT_WORKSPACE,marketType:"futures",timeframe:"1s"});
  assert.equal(normalizeWorkspace(futures).timeframe,"1m");
  assert.equal(normalizeWorkspace({...futures,exchange:"kraken"}).exchange,"kraken");
  const legacy={...DEFAULT_WORKSPACE} as Record<string,unknown>;delete legacy.marketType;
  assert.equal(workspaceSettingsSchema.parse(legacy).marketType,"spot");
  assert.equal(workspaceSettingsSchema.parse({...futures,...workspacePatchSchema.parse({selected:"ETH"})}).marketType,"futures");
  const spot={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT"},future={...spot,marketType:"futures" as const};
  assert.notEqual(indicatorScopeKey(indicatorScopeSchema.parse(spot)),indicatorScopeKey(indicatorScopeSchema.parse(future)));
  assert.notEqual(scopeKey(drawingScopeSchema.parse(spot)),scopeKey(drawingScopeSchema.parse(future)));
});
