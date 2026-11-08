import {record,rows} from "./trades/types";
import {whitebitCandles} from "./exchanges/whitebit-normalize";
import {cryptocomCandles} from "./exchanges/cryptocom-normalize";
import {wsInterval} from "./intervals";
import type {CandleStreamOptions} from "./stream";
import type {ExchangeId} from "./types";
export const WHITEBIT_WS="wss://wss.whitebit.com/ws";
export const WHITEBIT_PING={id:99,method:"ping",params:[]};
export const CRYPTOCOM_WS="wss://stream.crypto.com/exchange/v1/market";
export function cryptoReply(input:unknown){const event=record(input);return event.method==="public/heartbeat"?{id:event.id,method:"public/respond-heartbeat"}:undefined;}
export function cryptoSubscription(channels:string[]){return {id:1,method:"subscribe",params:{channels},nonce:Date.now()};}
export function venueCandleSettings(exchange:"whitebit"|"cryptocom",options:Pick<CandleStreamOptions,"symbol"|"timeframe">){
  const interval=wsInterval(exchange,options.timeframe);
  return exchange==="whitebit"?{url:WHITEBIT_WS,message:{id:1,method:"candles_subscribe",params:[options.symbol,Number(interval)]},ping:JSON.stringify(WHITEBIT_PING)}
    :{url:CRYPTOCOM_WS,message:cryptoSubscription([`candlestick.${interval}.${options.symbol}`]),subscribeDelayMs:1000,reply:cryptoReply};
}
export function decodeVenueCandle(exchange:ExchangeId,input:unknown,options:Pick<CandleStreamOptions,"symbol"|"timeframe">){
  const event=record(input);
  if(exchange==="whitebit"){
    if(event.method!=="candles_update")return;
    const candles=rows(event.params).filter(r=>Array.isArray(r)&&r[7]===options.symbol);
    return whitebitCandles(candles).at(-1);
  }
  const result=record(event.result);
  if(result.subscription!==`candlestick.${wsInterval("cryptocom",options.timeframe)}.${options.symbol}`||result.instrument_name!==options.symbol)return;
  return cryptocomCandles(result.data).at(-1);
}
