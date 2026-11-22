import {z} from "zod";
import {MarketError} from "../errors";
import {normalizeCandles,normalizeTickerBatch} from "../normalize";
import {choosePairs} from "../exchange-config";
import {priceIncrement} from "../price-increment";
import {record,foreignTickers} from "./foreign-normalize";
import {extraTickers} from "./extra-normalize";
import {cryptocomTickers,cryptocomResult,cryptocomCandles} from "./cryptocom-normalize";
import {whitebitCandles,whitebitResult} from "./whitebit-normalize";
import type {ExchangeId,TradingPair,Candle} from "../types";
import {futuresContractInfo} from "../futures-settings";

export type ExtraFuturesId=Exclude<ExchangeId,"binance"|"bybit"|"okx">;
const records=z.array(record);
export function futuresData(id:ExtraFuturesId,input:unknown):unknown{
  if(id==="gate"||id==="bitfinex"||id==="whitebit")return input;
  const root=record.parse(input);
  const valid=id==="bitget"?root.code==="00000":id==="kucoin"?root.code==="200000":id==="htx"?root.status==="ok":id==="mexc"?root.success===true:id==="bingx"||id==="cryptocom"?root.code===0:id==="kraken"?root.result==="success":!root.error;
  if(!valid)throw new MarketError("UPSTREAM_ERROR",`${id}: ${String(root.msg??root.message??root.error??"неверный ответ API")}`);
  return id==="cryptocom"?cryptocomResult(input).data:id==="kraken"?root.instruments??root.tickers??root.orderBook:id==="coinbase"?root.products??root.candles??root.pricebook:root.data??root.ticks;
}
const positive=(value:unknown)=>z.coerce.number().positive().finite().parse(value);
const asset=(value:unknown)=>String(value)==="XBT"?"BTC":String(value);
export function extraFuturesPairs(id:ExtraFuturesId,input:unknown):TradingPair[]{
  const data=futuresData(id,input);
  if(id==="bitfinex")return choosePairs(z.array(z.array(z.string())).parse(data)[0].filter(symbol=>symbol.endsWith(":USTF0")&&!symbol.startsWith("TEST")).map(symbol=>({exchange:id,marketType:"futures",symbol:`t${symbol}`,baseAsset:symbol.split(":")[0].replace(/F0$/,""),quoteAsset:"USDT",contractSize:1})));
  const pairs:TradingPair[]=[];
  for(const row of records.parse(data)){
    let symbol:unknown,base:unknown,quote:unknown,size:unknown=1,tick:unknown;
    switch(id){
      case "bitget":if(row.symbolType!=="perpetual"||row.symbolStatus!=="normal"||row.quoteCoin!=="USDT")continue;symbol=row.symbol;base=row.baseCoin;quote=row.quoteCoin;tick=Number(row.priceEndStep)*10**-Number(row.pricePlace);break;
      case "gate":if(row.in_delisting===true||row.type!=="direct")continue;symbol=row.name;base=String(symbol).split("_")[0];quote="USDT";size=row.quanto_multiplier;tick=row.order_price_round;break;
      case "kraken":if(row.tradeable!==true||row.suspended===true||row.isExpired===true||!String(row.symbol).startsWith("PF_"))continue;symbol=row.symbol;base=row.base;quote=row.quote;size=row.contractSize;tick=row.tickSize;break;
      case "coinbase":{const details=record.parse(row.future_product_details);if(row.product_type!=="FUTURE"||row.trading_disabled===true||row.is_disabled===true||!String(details.group_short_description??details.contract_display_name).includes("Perp"))continue;symbol=row.product_id;base=details.contract_root_unit;quote=row.quote_currency_id;size=details.contract_size;tick=row.price_increment;break;}
      case "kucoin":if(row.status!=="Open"||row.isInverse!==false||row.settleCurrency!=="USDT"||row.expireDate!=null)continue;symbol=row.symbol;base=asset(row.baseCurrency);quote=row.quoteCurrency;size=row.multiplier;tick=row.tickSize;break;
      case "htx":if(row.contract_status!==1||row.business_type!=="swap"||row.trade_partition!=="USDT")continue;symbol=row.contract_code;base=row.symbol;quote="USDT";size=row.contract_size;tick=row.price_tick;break;
      case "mexc":if(row.state!==0||row.settleCoin!=="USDT"||row.futureType!==1)continue;symbol=row.symbol;base=row.baseCoin;quote=row.quoteCoin;size=row.contractSize;tick=row.priceUnit;break;
      case "whitebit":if(row.type!=="futures"||row.tradesEnabled!==true||row.delistedAt!=null)continue;symbol=row.name;base=row.stock;quote=row.money;tick=row.tickSize;break;
      case "cryptocom":if(row.inst_type!=="PERPETUAL_SWAP"||row.tradable!==true)continue;symbol=row.symbol;base=row.base_ccy;quote=row.quote_ccy;size=row.contract_size;break;
      case "bingx":if(row.status!==1||row.currency!=="USDT")continue;symbol=row.symbol;base=row.asset;quote=row.currency;tick=10**-Number(row.pricePrecision);break;
    }
    const pair:TradingPair={exchange:id,marketType:"futures",symbol:z.string().min(1).parse(symbol),baseAsset:z.string().min(1).parse(base),quoteAsset:z.string().min(1).parse(quote),contractSize:positive(size),...priceIncrement(id,row)};
    pair.futuresInfo=futuresContractInfo(id,row,pair.contractSize);
    if(tick!=null)pair.priceIncrement=positive(tick);
    pairs.push(pair);
  }
  return choosePairs(pairs);
}

export function extraFuturesTickers(id:ExtraFuturesId,input:unknown,pairs:TradingPair[]){
  const allowed=new Map(pairs.map(pair=>[pair.symbol,pair])),symbols=[...allowed.keys()];
  if(id==="bitget")return foreignTickers(id,input,symbols);
  if(id==="bitfinex")return extraTickers(id,input,symbols);
  if(id==="cryptocom")return cryptocomTickers(input,symbols);
  const data=id==="whitebit"?whitebitResult(input):futuresData(id,input);
  const rows=records.parse(data);
  return normalizeTickerBatch(rows.flatMap<Record<string,unknown>>(row=>{
    const symbol=String(row.symbol??row.contract??row.contract_code??row.product_id??row.ticker_id),pair=allowed.get(symbol);if(!pair)return [];
    const size=pair.contractSize??1;
    let last:unknown,bid:unknown=null,ask:unknown=null,bidSize:unknown=null,askSize:unknown=null,volume:unknown,turnover:unknown=null,change:unknown=null,high:unknown,low:unknown,time:unknown=null;
    switch(id){
      case "gate":last=row.last;bid=row.highest_bid;ask=row.lowest_ask;bidSize=Number(row.highest_size)*size;askSize=Number(row.lowest_size)*size;volume=row.volume_24h_base;turnover=row.volume_24h_quote;change=row.change_percentage;high=row.high_24h;low=row.low_24h;break;
      case "kraken":last=row.last;bid=row.bid;ask=row.ask;bidSize=row.bidSize;askSize=row.askSize;volume=row.vol24h;turnover=row.volumeQuote;change=row.change24h;high=row.high24h;low=row.low24h;time=Date.parse(String(row.lastTime));break;
      case "coinbase":last=row.price;volume=Number(row.volume_24h)*size;turnover=row.approximate_quote_24h_volume;change=row.price_percentage_change_24h;high=row.high_24h;low=row.low_24h;break;
      case "kucoin":last=row.lastTradePrice;volume=row.volumeOf24h;turnover=row.turnoverOf24h;change=Number(row.priceChgPct)*100;high=row.highPrice;low=row.lowPrice;break;
      case "htx":{last=row.close;const b=Array.isArray(row.bid)?row.bid:[],a=Array.isArray(row.ask)?row.ask:[];bid=b[0]??null;ask=a[0]??null;bidSize=b[1]==null?null:Number(b[1])*size;askSize=a[1]==null?null:Number(a[1])*size;volume=row.amount;turnover=row.trade_turnover;change=Number(row.open)>0?(Number(last)/Number(row.open)-1)*100:null;high=row.high;low=row.low;time=row.ts;break;}
      case "mexc":last=row.lastPrice;bid=row.bid1;ask=row.ask1;volume=Number(row.volume24)*size;turnover=row.amount24;change=Array.isArray(row.riseFallRatesOfTimezone)?Number(row.riseFallRatesOfTimezone[0])*100:null;high=row.high24Price;low=row.lower24Price;time=row.timestamp;break;
      case "whitebit":last=row.last_price;bid=row.bid;ask=row.ask;volume=row.stock_volume;turnover=row.money_volume;high=row.high;low=row.low;break;
      case "bingx":return [{...row,bidPrice:row.bidPrice??null,askPrice:row.askPrice??null,bidQty:row.bidQty??null,askQty:row.askQty??null}];
    }
    return [{symbol,lastPrice:last,priceChangePercent:change,quoteVolume:turnover,volume,bidPrice:bid??null,askPrice:ask??null,bidQty:bidSize,askQty:askSize,highPrice:high,lowPrice:low,closeTime:Number.isFinite(Number(time))?time:null}];
  }),Date.now(),id);
}

export function extraFuturesCandles(id:ExtraFuturesId,input:unknown,pair:TradingPair):Candle[]{
  if(id==="whitebit")return whitebitCandles(whitebitResult(input));
  if(id==="cryptocom")return cryptocomCandles(cryptocomResult(input).data);
  if(id==="bitfinex")return normalizeCandles(z.array(z.array(z.unknown())).parse(input).map(row=>[row[0],row[1],row[3],row[4],row[2],row[5]]));
  const data=id==="kraken"?record.parse(input).candles:futuresData(id,input),size=pair.contractSize??1;
  if(id==="mexc"){
    const x=record.parse(data),times=z.array(z.number()).parse(x.time),column=(key:string)=>z.array(z.unknown()).parse(x[key]);
    const o=column("open"),h=column("high"),l=column("low"),c=column("close"),v=column("vol");
    return normalizeCandles(times.map((time,i)=>[time*1000,o[i],h[i],l[i],c[i],Number(v[i])*size]));
  }
  if(id==="bitget"||id==="kucoin")return normalizeCandles(z.array(z.array(z.unknown())).parse(data).map(row=>[...row.slice(0,5),Number(row[5])*(id==="kucoin"?size:1)]));
  return normalizeCandles(records.parse(data).map(row=>{
    switch(id){
      case "gate":return [Number(row.t)*1000,row.o,row.h,row.l,row.c,Number(row.v)*size];
      case "kraken":return [row.time,row.open,row.high,row.low,row.close,row.volume];
      case "coinbase":return [Number(row.start)*1000,row.open,row.high,row.low,row.close,Number(row.volume)*size];
      case "htx":return [Number(row.id)*1000,row.open,row.high,row.low,row.close,row.amount];
      case "bingx":return [row.time,row.open,row.high,row.low,row.close,row.volume];
      default:throw new Error("Unsupported futures candles");
    }
  }));
}
