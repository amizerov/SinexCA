import {test} from "node:test";
import assert from "node:assert/strict";
import {foreignPairs} from "../lib/market/exchanges/foreign-normalize";
import {extraPairs} from "../lib/market/exchanges/extra-normalize";
import {whitebitPairs} from "../lib/market/exchanges/whitebit-normalize";
import {cryptocomPairs} from "../lib/market/exchanges/cryptocom-normalize";
import {filterQuote,quoteAssets,resolveQuote,selectedPair} from "../lib/market/pair-selection";
import {DEFAULT_WORKSPACE,workspaceSettingsSchema,workspacePatchSchema} from "../lib/ui/workspace-settings";
import {marketListQuery} from "../lib/market/schemas";
test("full catalogs retain all quote currencies while default normalizers remain compatible",()=>{
  const coinbase=["USD","USDT","USDC","BTC","EUR"].map(quote=>({id:`SOL-${quote}`,base_currency:"SOL",quote_currency:quote,status:"online",trading_disabled:false}));
  assert.equal(foreignPairs("coinbase",coinbase).length,1);
  const pairs=foreignPairs("coinbase",coinbase,null);
  assert.deepEqual(quoteAssets(pairs),["USDT","USD","USDC","BTC","EUR"]);
  assert.equal(filterQuote(pairs,"BTC")[0].symbol,"SOL-BTC");assert.equal(filterQuote(pairs,"all").length,5);
  const white=["USDT","BTC"].map(money=>({name:`SOL_${money}`,stock:"SOL",money,type:"spot",tradesEnabled:true}));assert.equal(whitebitPairs(white,null).length,2);
  const crypto={code:0,result:{data:["USD","USDT"].map(quote_ccy=>({symbol:`SOL_${quote_ccy}`,base_ccy:"SOL",quote_ccy,inst_type:"CCY_PAIR",tradable:true}))}};assert.equal(cryptocomPairs(crypto,null).length,2);
  for(const [id,input] of [
    ["bybit",{retCode:0,result:{list:[{symbol:"SOLBTC",baseCoin:"SOL",quoteCoin:"BTC",status:"Trading"}]}}],
    ["okx",{code:"0",data:[{instId:"SOL-BTC",baseCcy:"SOL",quoteCcy:"BTC",state:"live"}]}],
    ["bitget",{code:"00000",data:[{symbol:"SOLBTC",baseCoin:"SOL",quoteCoin:"BTC",status:"online"}]}],
    ["gate",[{id:"SOL_BTC",base:"SOL",quote:"BTC",trade_status:"tradable"}]],
    ["kraken",{error:[],result:{SOLXBT:{wsname:"SOL/XBT",status:"online"}}}],
  ] as const){const result=foreignPairs(id,input,null);assert.equal(result[0].quoteAsset,"BTC");}
  const extras={kucoin:{code:"200000",data:[{symbol:"SOL-BTC",baseCurrency:"SOL",quoteCurrency:"BTC",enableTrading:true}]},htx:{status:"ok",data:[{symbol:"solbtc","base-currency":"sol","quote-currency":"btc",state:"online"}]},mexc:{symbols:[{symbol:"SOLBTC",baseAsset:"SOL",quoteAsset:"BTC",status:"1",isSpotTradingAllowed:true}]}};
  for(const id of ["kucoin","htx","mexc"] as const)assert.equal(extraPairs(id,extras[id],null)[0].quoteAsset,"BTC");
});
test("Bitfinex keeps native symbols and normalizes both legacy and colon-separated asset codes",()=>{
  const pairs=extraPairs("bitfinex",[["SOLUSD","SOLBTC","SOLUST","USTUSD","LONG:UDC","TESTBTC:TESTUSDT"]],null);
  assert.deepEqual(pairs.find(p=>p.symbol==="tUSTUSD"),{exchange:"bitfinex",marketType:"spot",symbol:"tUSTUSD",baseAsset:"USDT",quoteAsset:"USD"});
  assert.equal(pairs.find(p=>p.symbol==="tLONG:UDC")?.quoteAsset,"USDC");assert.equal(pairs.length,5);
});
test("pair choice includes quote; unavailable quotes fall back without inventing a market",()=>{
  const pairs=foreignPairs("coinbase",["USD","USDT","BTC"].map(quote=>({id:`SOL-${quote}`,base_currency:"SOL",quote_currency:quote,status:"online",trading_disabled:false})),null);
  assert.equal(resolveQuote(pairs,"coinbase","auto"),"USD");assert.equal(resolveQuote(pairs,"coinbase","USDT"),"USDT");assert.equal(resolveQuote(pairs,"coinbase","EUR"),"USD");
  assert.equal(selectedPair(pairs,"SOL","BTC")?.symbol,"SOL-BTC");assert.equal(selectedPair(filterQuote(pairs,"USD"),"SOL","BTC")?.symbol,"SOL-USD");assert.equal(resolveQuote(pairs,"coinbase","all"),"all");
});
test("old workspaces migrate quote defaults and partial patches do not reset the quote",()=>{
  const {quote,selectedQuote,...legacy}=DEFAULT_WORKSPACE;void quote;void selectedQuote;
  assert.equal(workspaceSettingsSchema.parse(legacy).quote,"auto");assert.deepEqual(workspacePatchSchema.parse({orderBookOpen:true}),{orderBookOpen:true});
  for(const value of ["BTC","USD","USDT","all"])assert.equal(marketListQuery.safeParse({exchange:"coinbase",quote:value}).success,true);
  assert.equal(marketListQuery.safeParse({quote:"../../evil"}).success,false);
});
