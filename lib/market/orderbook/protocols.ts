import type {TradingPair} from "../types";
import {object,makeBook,bookLevels,type OrderBook} from "./model";
import {whitebitBookProtocol} from "./whitebit";
import {cryptocomBookProtocol} from "./cryptocom";
export interface BookProtocol {url:string;subscriptions:unknown[];subscribeDelayMs?:number;ping?:unknown;pingMs?:number;reply?:(input:unknown)=>unknown;decode:(input:unknown)=>OrderBook|undefined}
export const BOOK_STREAM_EXCHANGES=["binance","bybit","okx","gate","htx","kucoin","whitebit","cryptocom"];
export async function bookProtocol(pair:TradingPair,signal:AbortSignal):Promise<BookProtocol|undefined>{
  const {exchange,symbol}=pair,book=(bids:unknown,asks:unknown,time?:unknown)=>makeBook(exchange,symbol,bids,asks,time);
  switch(exchange){
    case "whitebit":return whitebitBookProtocol(pair);
    case "cryptocom":return cryptocomBookProtocol(pair);
    case "binance":return {url:`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@depth20@100ms`,subscriptions:[],decode(input){const data=object(input);return data.lastUpdateId!=null?book(data.bids,data.asks):undefined;}};
    case "okx":return {url:"wss://ws.okx.com:8443/ws/v5/public",subscriptions:[{op:"subscribe",args:[{channel:"books5",instId:symbol}]}],ping:"ping",pingMs:15000,decode(input){const data=object(input),arg=object(data.arg);if(arg.channel!=="books5"||arg.instId!==symbol||data.action!=="snapshot")return;const item=object(Array.isArray(data.data)?data.data[0]:null);return book(item.bids,item.asks,item.ts);}};
    case "gate":return {url:"wss://api.gateio.ws/ws/v4/",subscriptions:[{time:Math.floor(Date.now()/1000),channel:"spot.order_book",event:"subscribe",payload:[symbol,"20","100ms"]}],ping:{channel:"spot.ping"},decode(input){const data=object(input),item=object(data.result);return data.channel==="spot.order_book"&&data.event==="update"&&item.s===symbol?book(item.bids,item.asks,item.t):undefined;}};
    case "htx":return {url:"wss://api.huobi.pro/ws",subscriptions:[{sub:`market.${symbol}.depth.step0`,id:"sinex-depth"}],reply(input){const data=object(input);return typeof data.ping==="number"?{pong:data.ping}:undefined;},decode(input){const data=object(input),tick=object(data.tick);return data.ch===`market.${symbol}.depth.step0`?book(tick.bids,tick.asks,data.ts):undefined;}};
    case "kucoin":{
      const response=await fetch("/api/market/kucoin-token",{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),cache:"no-store"});if(!response.ok)throw new Error("KuCoin token unavailable");
      const data=object(object(await response.json()).data),url=new URL(String(data.endpoint));if(url.protocol!=="wss:"||url.hostname!=="ws-api-spot.kucoin.com"||typeof data.token!=="string")throw new Error("Invalid KuCoin endpoint");
      url.search=new URLSearchParams({token:data.token,connectId:crypto.randomUUID()}).toString();
      return {url:url.href,subscriptions:[{id:crypto.randomUUID(),type:"subscribe",topic:`/spotMarket/level2Depth50:${symbol}`,privateChannel:false,response:true}],ping:{id:"sinex-depth",type:"ping"},pingMs:Math.min(15000,Number(data.pingInterval)*.7||15000),decode(input){const data=object(input),item=object(data.data);return data.type==="message"&&data.topic===`/spotMarket/level2Depth50:${symbol}`?book(item.bids,item.asks,item.timestamp):undefined;}};
    }
    case "bybit":return bybitBookProtocol(pair);
  }
}
/** A fresh instance per connection: deltas never use a REST or previous-connection snapshot. */
export function bybitBookProtocol(pair:TradingPair):BookProtocol{
  let ready=false,lastUpdate=0;const bids=new Map<number,number>(),asks=new Map<number,number>();
  return {url:"wss://stream.bybit.com/v5/public/spot",subscriptions:[{op:"subscribe",args:[`orderbook.50.${pair.symbol}`]}],ping:{op:"ping"},pingMs:15000,decode(input){
    const data=object(input),item=object(data.data);if(data.topic!==`orderbook.50.${pair.symbol}`||item.s!==pair.symbol)return;
    if(data.type!=="snapshot"&&data.type!=="delta")return;
    const update=Number(item.u);if(!Number.isSafeInteger(update)||update<1)throw new Error("Invalid Bybit sequence");
    if(data.type==="snapshot"){bids.clear();asks.clear();ready=true;lastUpdate=0;}
    else {if(!ready||update===1)throw new Error("Bybit snapshot required");if(update<=lastUpdate)return;}
    const bidChanges=bookLevels(item.b),askChanges=bookLevels(item.a);
    for(const [target,changes] of [[bids,bidChanges],[asks,askChanges]] as const)for(const row of changes){if(row.quantity===0)target.delete(row.price);else target.set(row.price,row.quantity);}
    if(bids.size>2000||asks.size>2000)throw new Error("Depth out of sync");
    lastUpdate=update;return makeBook(pair.exchange,pair.symbol,[...bids],[...asks],data.ts);
  }};
}
