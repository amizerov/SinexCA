import "server-only";
import {z} from "zod";
import {marketCache} from "@/lib/server/cache";
import {fetchJson} from "@/lib/server/fetch-json";
import {MarketError} from "../errors";
import {marketIntervalSpec,marketTimeframes} from "../market-type";
import {intervalSeconds} from "../intervals";
import {mergeCandles} from "../normalize";
import {record} from "./foreign-normalize";
import {extraFuturesPairs,extraFuturesTickers,extraFuturesCandles,futuresData,type ExtraFuturesId} from "./futures-extra-normalize";
import type {ExchangeAdapter} from "./adapter";
import type {Candle} from "../types";
import {whitebit} from "./whitebit";
import {cryptocom} from "./cryptocom";
import {bitfinex} from "./bitfinex";

export const FUTURES_ORIGINS={bitget:"https://api.bitget.com",gate:"https://api.gateio.ws",kraken:"https://futures.kraken.com",coinbase:"https://api.coinbase.com",kucoin:"https://api-futures.kucoin.com",bitfinex:"https://api-pub.bitfinex.com",htx:"https://api.hbdm.com",mexc:"https://contract.mexc.com",whitebit:"https://whitebit.com",cryptocom:"https://api.crypto.com",bingx:"https://open-api.bingx.com"};
const catalogs:Record<ExtraFuturesId,[string,Record<string,string>?]>={
  bitget:["/api/v2/mix/market/contracts",{productType:"USDT-FUTURES"}],gate:["/api/v4/futures/usdt/contracts",{limit:"100"}],kraken:["/derivatives/api/v3/instruments"],coinbase:["/api/v3/brokerage/market/products",{product_type:"FUTURE",limit:"1000"}],kucoin:["/api/v1/contracts/active"],bitfinex:["/v2/conf/pub:list:pair:futures"],htx:["/linear-swap-api/v1/swap_contract_info"],mexc:["/api/v1/contract/detail"],whitebit:["/api/v4/public/markets"],cryptocom:["/exchange/v1/public/get-instruments"],bingx:["/openApi/swap/v2/quote/contracts"],
};
const overviewPaths:Record<ExtraFuturesId,[string,Record<string,string>?]>={
  bitget:["/api/v2/mix/market/tickers",{productType:"USDT-FUTURES"}],gate:["/api/v4/futures/usdt/tickers"],kraken:["/derivatives/api/v3/tickers"],coinbase:catalogs.coinbase,kucoin:catalogs.kucoin,bitfinex:["/v2/tickers",{symbols:"ALL"}],htx:["/linear-swap-ex/market/detail/batch_merged"],mexc:["/api/v1/contract/ticker"],whitebit:["/api/v4/public/futures"],cryptocom:["/exchange/v1/public/get-tickers"],bingx:["/openApi/swap/v2/quote/ticker"],
};
export function createExtraFuturesExchange(id:ExtraFuturesId):ExchangeAdapter{
  const request=(path:string,params:Record<string,string>={})=>{const url=new URL(path,FUTURES_ORIGINS[id]);url.search=new URLSearchParams(params).toString();return fetchJson(url,"GET",id==="gate"&&path.endsWith("/tickers")&&!params.contract?20000:undefined);};
  async function catalogInput(){
    const [path,params]=catalogs[id];
    if(id==="gate"){
      const rows:unknown[]=[];
      for(let page=0;page<28;page+=4){
        const batches=await Promise.all(Array.from({length:4},(_,index)=>request(path,{...params,offset:String((page+index)*100)}).then(input=>z.array(z.unknown()).parse(input))));
        for(const batch of batches){rows.push(...batch);if(batch.length<100)return rows;}
      }
      throw new MarketError("INVALID_CATALOG","Gate: превышен лимит страниц каталога.");
    }
    if(id==="cryptocom"){
      const rows:unknown[]=[],seen=new Set<string>();let cursor="";
      do{const input=await request(path,{...params,...cursor?{cursor}:{}});rows.push(...z.array(z.unknown()).parse(futuresData(id,input)));const result=record.parse(record.parse(input).result);cursor=String(result.next_cursor??"");if(cursor){if(seen.has(cursor)||seen.size>=20)throw new Error("Crypto.com pagination failed");seen.add(cursor);}}while(cursor);
      return {code:0,result:{data:rows}};
    }
    return request(path,params);
  }
  const adapter:ExchangeAdapter={id,
    getPairs:()=>marketCache.get(`${id}:futures:catalog`,3600000,async()=>extraFuturesPairs(id,await catalogInput())),
    getOverview:()=>marketCache.get(`${id}:futures:overview`,5000,async()=>extraFuturesTickers(id,await request(...overviewPaths[id]),await adapter.getPairs())),
    getTickers:async symbols=>{
      if(id==="gate")return marketCache.get(`gate:futures:tickers:${[...symbols].sort().join(",")}`,5000,async()=>{
        const data=(await Promise.all(symbols.map(contract=>request("/api/v4/futures/usdt/tickers",{contract})))).flatMap(input=>z.array(z.unknown()).parse(input));
        return extraFuturesTickers(id,data,await adapter.getPairs());
      });
      const allowed=new Set(symbols);return (await adapter.getOverview!()).filter(ticker=>allowed.has(ticker.symbol));
    },
    getCandles:params=>marketCache.get(`${id}:futures:candles:${params.symbol}:${params.timeframe}:${params.limit}:${params.endTime??"latest"}`,10000,async()=>{
      const {symbol,timeframe,limit,endTime}=params;
      if(!marketTimeframes(id,"futures").includes(timeframe))throw new MarketError("INVALID_INTERVAL","Этот интервал недоступен для фьючерсов.",400);
      const pair=(await adapter.getPairs()).find(pair=>pair.symbol===symbol);if(!pair)throw new MarketError("INVALID_SYMBOL","Фьючерсный контракт недоступен.",400);
      if(id==="whitebit")return whitebit.getCandles(params);
      if(id==="cryptocom")return cryptocom.getCandles(params);
      if(id==="bitfinex")return bitfinex.getCandles(params);
      const bar=marketIntervalSpec(id,"futures",timeframe).rest,step=intervalSeconds(timeframe);
      let candles:Candle[]=[],end=endTime??Math.floor(Date.now()/1000);
      const pageSize=id==="coinbase"?300:id==="kucoin"?200:id==="bitget"?200:1000;
      for(let page=0;page<Math.ceil(limit/pageSize)+2&&candles.length<limit;page++){
        const count=Math.min(pageSize,limit-candles.length),from=Math.max(0,end-count*step);
        let path:string,query:Record<string,string>;
        switch(id){
          case "bitget":path="/api/v2/mix/market/candles";query={symbol,productType:"USDT-FUTURES",granularity:bar,limit:String(count),endTime:String(end*1000)};break;
          case "gate":path="/api/v4/futures/usdt/candlesticks";query={contract:symbol,interval:bar,from:String(from),to:String(end)};break;
          case "kraken":path=`/api/charts/v1/trade/${symbol}/${bar}`;query={count:String(count),to:String(end)};break;
          case "coinbase":path=`/api/v3/brokerage/market/products/${symbol}/candles`;query={start:String(from),end:String(end),granularity:bar,limit:String(count)};break;
          case "kucoin":path="/api/v1/kline/query";query={symbol,granularity:bar,from:String(from*1000),to:String(end*1000)};break;
          case "htx":path="/linear-swap-ex/market/history/kline";query={contract_code:symbol,period:bar,size:String(count),...endTime!==undefined||page?{from:String(from),to:String(end)}:{}};break;
          case "mexc":path=`/api/v1/contract/kline/${symbol}`;query={interval:bar,start:String(from),end:String(end)};break;
          case "bingx":path="/openApi/swap/v3/quote/klines";query={symbol,interval:bar,limit:String(Math.min(1000,count+1)),endTime:String(end*1000)};break;
          default:throw new Error("Unsupported futures candle request");
        }
        const batch=extraFuturesCandles(id,await request(path,query),pair).filter(candle=>candle.time<=end);
        if(!batch.length)break;
        const next=batch[0].time-1;if(next>=end)break;
        candles=mergeCandles(batch,candles,limit);end=next;
      }
      return candles.slice(-limit);
    }),
  };
  return adapter;
}
