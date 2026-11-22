import "server-only";
import type {ExchangeId,MarketType} from "../types";
import {getExchange} from "../service";
import {futuresBookRequest} from "./futures-rest";
import {fetchJson} from "@/lib/server/fetch-json";
import {marketCache} from "@/lib/server/cache";
import {MarketError} from "../errors";
import {makeBook,bookLevels} from "./model";
import {binanceBook} from "./binance";
import {bybitBook} from "./bybit";
import {okxBook} from "./okx";
import {bitgetBook} from "./bitget";
import {gateBook} from "./gate";
import {krakenBook} from "./kraken";
import {coinbaseBook} from "./coinbase";
import {kucoinBook} from "./kucoin";
import {bitfinexBook} from "./bitfinex";
import {htxBook} from "./htx";
import {mexcBook} from "./mexc";
import {whitebitBook} from "./whitebit";
import {cryptocomBook} from "./cryptocom";
import {bingxBook} from "./bingx";
const adapters={binance:binanceBook,bybit:bybitBook,okx:okxBook,bitget:bitgetBook,gate:gateBook,kraken:krakenBook,coinbase:coinbaseBook,kucoin:kucoinBook,bitfinex:bitfinexBook,htx:htxBook,mexc:mexcBook,whitebit:whitebitBook,cryptocom:cryptocomBook,bingx:bingxBook};
export function getOrderBook(exchange:ExchangeId,symbol:string,marketType:MarketType="spot"){return marketCache.get(`book:${exchange}:${marketType}:${symbol}`,800,async()=>{
  let request=adapters[exchange](symbol);
  let size=1;
  if(marketType==="futures"){
    const pair=(await getExchange(exchange,marketType).getPairs()).find(pair=>pair.symbol===symbol);
    if(!pair)throw new MarketError("INVALID_SYMBOL","Фьючерсный контракт недоступен.",400);
    size=pair.contractSize??1;
    request=futuresBookRequest(pair,request);
  }
  const input=await fetchJson(request.url);
  try{const data=request.decode(input),scale=(rows:unknown)=>size===1?rows:bookLevels(rows).map(row=>[row.price,row.quantity*size]);return makeBook(exchange,symbol,scale(data.bids),scale(data.asks),data.time);}catch{throw new MarketError("INVALID_DEPTH","Биржа вернула некорректные данные стакана. Повторите позже.",502);}
});}
