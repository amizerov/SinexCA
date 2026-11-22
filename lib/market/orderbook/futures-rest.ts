import type {TradingPair} from "../types";
import {bookUrl,type BookRequest} from "./rest-types";
import {object} from "./model";
import {futuresData,type ExtraFuturesId} from "../exchanges/futures-extra-normalize";

export function futuresBookRequest(pair:TradingPair,fallback:BookRequest):BookRequest{
  const {exchange,symbol}=pair;
  const request=(origin:string,path:string,params:Record<string,string>,decode:BookRequest["decode"]):BookRequest=>({url:bookUrl(origin,path,params),decode});
  switch(exchange){
    case "binance":return {...fallback,url:bookUrl("https://fapi.binance.com","/fapi/v1/depth",{symbol,limit:"20"})};
    case "bybit":fallback.url.searchParams.set("category","linear");return fallback;
    case "okx":case "bitfinex":case "whitebit":case "cryptocom":return fallback;
    case "bitget":return request("https://api.bitget.com","/api/v2/mix/market/merge-depth",{symbol,productType:"USDT-FUTURES",limit:"20"},input=>{const x=object(futuresData(exchange,input));return {bids:x.bids,asks:x.asks,time:x.ts};});
    case "gate":return request("https://api.gateio.ws","/api/v4/futures/usdt/order_book",{contract:symbol,limit:"20"},input=>{const x=object(input),side=(rows:unknown)=>Array.isArray(rows)?rows.map(row=>{const r=object(row);return [r.p,r.s];}):rows;return {bids:side(x.bids),asks:side(x.asks),time:Number(x.current)*1000};});
    case "kraken":return request("https://futures.kraken.com","/derivatives/api/v3/orderbook",{symbol},input=>{const x=object(futuresData(exchange,input));return {bids:x.bids,asks:x.asks};});
    case "coinbase":return request("https://api.coinbase.com","/api/v3/brokerage/market/product_book",{product_id:symbol,limit:"20"},input=>{const x=object(futuresData(exchange,input)),side=(rows:unknown)=>Array.isArray(rows)?rows.map(row=>{const r=object(row);return [r.price,r.size];}):rows;return {bids:side(x.bids),asks:side(x.asks),time:Date.parse(String(x.time))};});
    case "kucoin":return request("https://api-futures.kucoin.com","/api/v1/level2/depth20",{symbol},input=>{const x=object(futuresData(exchange,input));return {bids:x.bids,asks:x.asks,time:Number(x.ts)/1e6};});
    case "htx":return request("https://api.hbdm.com","/linear-swap-ex/market/depth",{contract_code:symbol,type:"step0"},input=>{const root=object(input);if(root.status!=="ok")throw new Error("HTX depth error");const x=object(root.tick);return {bids:x.bids,asks:x.asks,time:x.ts??root.ts};});
    case "mexc":case "bingx":return request(exchange==="mexc"?"https://contract.mexc.com":"https://open-api.bingx.com",exchange==="mexc"?`/api/v1/contract/depth/${symbol}`:"/openApi/swap/v2/quote/depth",exchange==="mexc"?{limit:"20"}:{symbol,limit:"20"},input=>{const x=object(futuresData(exchange as ExtraFuturesId,input));return {bids:x.bids,asks:x.asks,time:x.timestamp??x.T};});
  }
}
