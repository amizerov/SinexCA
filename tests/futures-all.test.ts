import {test} from "node:test";
import assert from "node:assert/strict";
import {extraFuturesPairs,extraFuturesTickers,extraFuturesCandles,futuresData,type ExtraFuturesId} from "../lib/market/exchanges/futures-extra-normalize";
import {futuresBookRequest} from "../lib/market/orderbook/futures-rest";
import {extraFuturesBookProtocol} from "../lib/market/orderbook/futures-protocols";
import {futuresTrades} from "../lib/market/trades/futures";
import {futuresCandleProtocol} from "../lib/market/futures-candles";
import {FUTURES_EXCHANGES,marketTimeframes,marketTimeframe} from "../lib/market/market-type";
import {EXCHANGE_IDS} from "../lib/market/exchange-config";
import {candleQuery} from "../lib/market/schemas";
import type {TradingPair} from "../lib/market/types";

const signal=new AbortController().signal;
const fixtures:Record<ExtraFuturesId,{input:unknown;symbol:string;quote:string;size:number}>={
  bitget:{input:{code:"00000",data:[{symbol:"BTCUSDT",symbolType:"perpetual",symbolStatus:"normal",baseCoin:"BTC",quoteCoin:"USDT",priceEndStep:"1",pricePlace:"1"}]},symbol:"BTCUSDT",quote:"USDT",size:1},
  gate:{input:[{name:"BTC_USDT",type:"direct",in_delisting:false,quanto_multiplier:"0.0001",order_price_round:"0.1"}],symbol:"BTC_USDT",quote:"USDT",size:.0001},
  kraken:{input:{result:"success",instruments:[{symbol:"PF_XBTUSD",tradeable:true,suspended:false,isExpired:false,base:"BTC",quote:"USD",contractSize:1,tickSize:1}]},symbol:"PF_XBTUSD",quote:"USD",size:1},
  coinbase:{input:{products:[{product_id:"BIP-20DEC30-CDE",product_type:"FUTURE",trading_disabled:false,is_disabled:false,quote_currency_id:"USD",price_increment:"5",future_product_details:{contract_root_unit:"BTC",contract_size:"0.01",group_short_description:"nano BTC Perp"}}]},symbol:"BIP-20DEC30-CDE",quote:"USD",size:.01},
  kucoin:{input:{code:"200000",data:[{symbol:"XBTUSDTM",baseCurrency:"XBT",quoteCurrency:"USDT",settleCurrency:"USDT",status:"Open",isInverse:false,expireDate:null,multiplier:.001,tickSize:.1}]},symbol:"XBTUSDTM",quote:"USDT",size:.001},
  bitfinex:{input:[["BTCF0:USTF0","TESTBTCF0:TESTUSDTF0","ETHF0:BTCF0"]],symbol:"tBTCF0:USTF0",quote:"USDT",size:1},
  htx:{input:{status:"ok",data:[{contract_code:"BTC-USDT",symbol:"BTC",contract_status:1,business_type:"swap",trade_partition:"USDT",contract_size:.001,price_tick:.1}]},symbol:"BTC-USDT",quote:"USDT",size:.001},
  mexc:{input:{success:true,data:[{symbol:"BTC_USDT",state:0,settleCoin:"USDT",futureType:1,baseCoin:"BTC",quoteCoin:"USDT",contractSize:.0001,priceUnit:.1}]},symbol:"BTC_USDT",quote:"USDT",size:.0001},
  whitebit:{input:[{name:"BTC_PERP",type:"futures",tradesEnabled:true,delistedAt:null,stock:"BTC",money:"USDT",tickSize:"0.1"}],symbol:"BTC_PERP",quote:"USDT",size:1},
  cryptocom:{input:{code:0,result:{data:[{symbol:"BTCUSD-PERP",inst_type:"PERPETUAL_SWAP",tradable:true,base_ccy:"BTC",quote_ccy:"USD",contract_size:"1",price_tick_size:"0.1"}]}},symbol:"BTCUSD-PERP",quote:"USD",size:1},
  bingx:{input:{code:0,data:[{symbol:"BTC-USDT",asset:"BTC",currency:"USDT",status:1,pricePrecision:1}]},symbol:"BTC-USDT",quote:"USDT",size:1},
};
const pairs=Object.fromEntries(Object.entries(fixtures).map(([id,f])=>[id,extraFuturesPairs(id as ExtraFuturesId,f.input)[0]])) as Record<ExtraFuturesId,TradingPair>;

test("all 14 futures venues retain their native symbols, quote currencies and quantity multipliers",()=>{
  assert.deepEqual(FUTURES_EXCHANGES,EXCHANGE_IDS);
  for(const [id,fixture] of Object.entries(fixtures)){
    const list=extraFuturesPairs(id as ExtraFuturesId,fixture.input);assert.equal(list.length,1,id);
    assert.equal(list[0].symbol,fixture.symbol,id);assert.equal(list[0].baseAsset,"BTC",id);assert.equal(list[0].quoteAsset,fixture.quote,id);assert.equal(list[0].contractSize,fixture.size,id);assert.equal(list[0].marketType,"futures",id);
    for(const tf of marketTimeframes(id as ExtraFuturesId,"futures"))assert.equal(candleQuery.safeParse({exchange:id,marketType:"futures",symbol:fixture.symbol,timeframe:tf}).success,true,`${id}:${tf}`);
  }
  assert.equal(marketTimeframe("kraken","futures","15d"),"1w");
  assert.throws(()=>futuresData("mexc",{success:false,data:[]}));
  assert.throws(()=>futuresData("coinbase",{error:"not available"}));
});

test("contract volumes in Gate, KuCoin, Coinbase and MEXC candles convert to base asset exactly once",()=>{
  const cases:[ExtraFuturesId,unknown,number][]=[
    ["gate",[{t:60,o:10,h:12,l:9,c:11,v:1000}],.1],
    ["kucoin",{code:"200000",data:[[60000,10,12,9,11,1000]]},1],
    ["coinbase",{candles:[{start:60,open:10,high:12,low:9,close:11,volume:1000}]},10],
    ["mexc",{success:true,data:{time:[60],open:[10],high:[12],low:[9],close:[11],vol:[1000]}},.1],
    ["htx",{status:"ok",data:[{id:60,open:10,high:12,low:9,close:11,amount:2,vol:2000}]},2],
  ];
  for(const [id,input,volume] of cases){const [c]=extraFuturesCandles(id,input,pairs[id]);assert.equal(c.time,60,id);assert.equal(c.volume,volume,id);assert.equal(c.close,11,id);}
});

test("MEXC rolling change uses the UTC rolling field, and KuCoin overview keeps base volume",()=>{
  const [m]=extraFuturesTickers("mexc",{success:true,data:[{symbol:"BTC_USDT",lastPrice:100,bid1:99,ask1:101,volume24:1000,amount24:10,riseFallRate:.5,riseFallRatesOfTimezone:[.02,.03,.5],high24Price:110,lower24Price:90}]},[pairs.mexc]);
  assert.equal(m.priceChangePercent24h,2);assert.equal(m.baseVolume24h,.1);
  const [k]=extraFuturesTickers("kucoin",{code:"200000",data:[{symbol:"XBTUSDTM",lastTradePrice:100,volumeOf24h:3,turnoverOf24h:300,priceChgPct:.01,highPrice:110,lowPrice:90}]},[pairs.kucoin]);
  assert.equal(k.baseVolume24h,3);assert.equal(k.quoteVolume24h,300);
});

test("all futures REST depth requests select derivative APIs rather than spot routes",()=>{
  for(const id of ["bitget","gate","kraken","coinbase","kucoin","htx","mexc","bingx"] as const){
    const request=futuresBookRequest(pairs[id],{url:new URL("https://example.com/spot"),decode:()=>({bids:[],asks:[]})});
    assert(!request.url.pathname.includes("/spot"),id);assert(request.url.hostname!=="example.com",id);
  }
});

test("incremental Kraken and Coinbase futures books require snapshots and detect sequence gaps",async()=>{
  const k=await extraFuturesBookProtocol(pairs.kraken,signal);
  assert.equal(k.decode({feed:"book",product_id:pairs.kraken.symbol,seq:1,side:"buy",price:100,qty:1}),undefined);
  const first=k.decode({feed:"book_snapshot",product_id:pairs.kraken.symbol,seq:10,bids:[{price:100,qty:2}],asks:[{price:101,qty:3}]});assert.equal(first?.bids[0].quantity,2);
  assert.throws(()=>k.decode({feed:"book",product_id:pairs.kraken.symbol,seq:12,side:"buy",price:100,qty:1}));
  const c=await extraFuturesBookProtocol(pairs.coinbase,signal);
  const book=c.decode({channel:"l2_data",sequence_num:0,events:[{type:"snapshot",product_id:pairs.coinbase.symbol,updates:[{side:"bid",price_level:100,new_quantity:100},{side:"offer",price_level:101,new_quantity:200}]}]});assert.equal(book?.bids[0].quantity,1);assert.equal(book?.asks[0].quantity,2);
  c.decode({channel:"subscriptions",sequence_num:1});c.decode({channel:"heartbeats",sequence_num:2});
  assert.equal(c.decode({channel:"l2_data",sequence_num:3,events:[{type:"update",product_id:pairs.coinbase.symbol,updates:[{side:"bid",price_level:100,new_quantity:50}]}]})?.bids[0].quantity,.5);
  assert.throws(()=>c.decode({channel:"l2_data",sequence_num:5,events:[]}));
});

test("MEXC trades convert contracts; Gate snapshots ignore incremental legacy frames",async()=>{
  const protocol=await futuresTrades([pairs.mexc],signal),ticks=protocol.decode({channel:"push.deal",symbol:pairs.mexc.symbol,data:[{p:100,v:1000,t:1000,T:1}]});assert.equal(ticks[0].quantity,.1);assert.equal(ticks[0].side,"buy");
  const gate=await extraFuturesBookProtocol(pairs.gate,signal);
  assert.equal(gate.decode({channel:"futures.order_book",event:"update",result:{contract:pairs.gate.symbol,bids:[],asks:[]}}),undefined);
  const book=gate.decode({channel:"futures.order_book",event:"all",result:{contract:pairs.gate.symbol,bids:[{p:100,s:1000}],asks:[{p:101,s:2000}]}});assert.equal(book?.bids[0].quantity,.1);
  const candle=await futuresCandleProtocol("mexc",{symbol:pairs.mexc.symbol,timeframe:"1h",contractSize:.0001,onCandle(){},onReconnect(){},onStatus(){}},signal);
  assert.equal(candle.decode({channel:"push.kline",symbol:pairs.mexc.symbol,data:{symbol:pairs.mexc.symbol,interval:"Min60",t:60,o:10,h:12,l:9,c:11,q:1000}})?.volume,.1);
});
