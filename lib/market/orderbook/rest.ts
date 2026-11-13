import "server-only";
import type {ExchangeId} from "../types";
import {fetchJson} from "@/lib/server/fetch-json";
import {marketCache} from "@/lib/server/cache";
import {MarketError} from "../errors";
import {makeBook} from "./model";
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
export function getOrderBook(exchange:ExchangeId,symbol:string){return marketCache.get(`book:${exchange}:${symbol}`,800,async()=>{
  const request=adapters[exchange](symbol),input=await fetchJson(request.url);
  try{const data=request.decode(input);return makeBook(exchange,symbol,data.bids,data.asks,data.time);}catch{throw new MarketError("INVALID_DEPTH","Биржа вернула некорректные данные стакана. Повторите позже.",502);}
});}
