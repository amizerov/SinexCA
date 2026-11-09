"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {ExchangeId,Ticker,TradingPair,StreamStatus} from "@/lib/market/types";
import {subscribeTrades,type TradeConnection} from "@/lib/market/trades/stream";
import type {TradeTick} from "@/lib/market/trades/types";
import {mergeTrades} from "@/lib/market/trades/tape";
import {useMarketResource} from "./use-market-resource";
interface StreamState {key:string;ticks:Map<string,TradeTick>;trades?:TradeTick[];status:StreamStatus;lastStreamAt?:number;connection?:TradeConnection}
export function useMarketTickers(exchange:ExchangeId,pairs:TradingPair[]|undefined,selected:TradingPair|undefined,quote?:string){
  const overview=useMarketResource<Ticker[]>(pairs?.length?`/api/market/overview?exchange=${exchange}${quote?`&quote=${encodeURIComponent(quote)}`:""}`:null,60000);
  const encoded=JSON.stringify(selected||null),key=`${exchange}:${encoded}`;
  const [stream,setStream]=useState<StreamState>();
  const current=stream?.key===key?stream:undefined,status=current?.status||"connecting";
  const fallback=useMarketResource<Ticker[]>(selected?`/api/market/tickers?exchange=${exchange}&symbols=${encodeURIComponent(selected.symbol)}`:null,status==="live"?60000:5000);
  const refreshSelected=fallback.refresh;
  useEffect(()=>{
    const pair=JSON.parse(encoded) as TradingPair|null;if(!pair)return;
    let stopped=false;
    const patch=(update:Partial<StreamState>)=>{if(!stopped)setStream(old=>({key,ticks:new Map(),status:"connecting",...old?.key===key?old:{},...update}));};
    const stop=subscribeTrades(exchange,[pair],{
      onStatus:value=>patch({status:value,...value==="reconnecting"?{ticks:new Map()}: {}}),
      onReconnect:refreshSelected,
      onConnection:connection=>patch({connection}),
      onTrades:updates=>{if(!stopped)setStream(old=>({key,ticks:new Map(),status:"connecting",...old?.key===key?old:{},trades:mergeTrades(old?.key===key?old.trades||[]:[],updates)}));},
      onTicks:updates=>{if(!stopped)patch({ticks:new Map(updates.map(tick=>[tick.symbol,tick])),lastStreamAt:Date.now()});},
    });
    return()=>{stopped=true;stop();};
  },[exchange,encoded,key,refreshSelected]);
  const data=useMemo(()=>{
    const tickers=new Map(overview.data?.map(ticker=>[ticker.symbol,ticker]));
    for(const ticker of fallback.data||[]){const old=tickers.get(ticker.symbol);if(!old||ticker.receivedAt>=old.receivedAt)tickers.set(ticker.symbol,ticker);}
    return [...tickers.values()].map(ticker=>{
      const tick=current?.ticks.get(ticker.symbol);
      return tick&&(status==="live"||tick.receivedAt>ticker.receivedAt)?{...ticker,lastPrice:tick.price,exchangeTime:tick.time,receivedAt:tick.receivedAt}:ticker;
    });
  },[overview.data,fallback.data,current,status]);
  const refreshAll=overview.refresh;
  const refresh=useCallback(()=>{refreshAll();refreshSelected();},[refreshAll,refreshSelected]);
  return {data,ticks:current?.ticks,trades:current?.trades||[],status,connection:current?.connection,lastStreamAt:current?.lastStreamAt,error:overview.error||fallback.error,loading:!!pairs?.length&&overview.loading&&!overview.data,refresh};
}
