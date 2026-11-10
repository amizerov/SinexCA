"use client";
import {useEffect,useState} from "react";
import type {TradingPair} from "@/lib/market/types";
import type {OrderBook} from "@/lib/market/orderbook/model";
import {subscribeBook} from "@/lib/market/orderbook/stream";
export function useOrderBook(pair:TradingPair,enabled=true){
  const [book,setBook]=useState<OrderBook>(),[error,setError]=useState(""),[mode,setMode]=useState<"connecting"|"ws"|"rest">("connecting"),[now,setNow]=useState(0),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,wsVersion=0,lastWs=0,failures=0;
    const stop=subscribeBook(pair,data=>{if(controller.signal.aborted)return;wsVersion++;lastWs=Date.now();setBook(data);setError("");setMode("ws");},live=>{if(!live&&!controller.signal.aborted){lastWs=0;setMode(previous=>previous==="ws"?"rest":previous);}});
    async function poll(){
      let delay=1000;
      try{
        if(controller.signal.aborted)return;
        if(lastWs&&Date.now()-lastWs<5000)return;
        const version=wsVersion;
        const response=await fetch(`/api/market/orderbook?${new URLSearchParams({exchange:pair.exchange,symbol:pair.symbol})}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
        const json=await response.json();
        if(!response.ok){delay=Math.min(60000,Math.max(2000,Number(response.headers.get("Retry-After"))*1000||0));throw new Error(json.error?.message||"Не удалось загрузить стакан.");}
        const data=json.data as OrderBook;
        if(data.exchange!==pair.exchange||data.symbol!==pair.symbol||!Array.isArray(data.bids)||!Array.isArray(data.asks)||!Number.isFinite(data.receivedAt))throw new Error("Получен стакан другой пары или биржи.");
        failures=0;if(!controller.signal.aborted&&version===wsVersion){setBook(data);setMode("rest");setError("");}
      }catch(reason){if(!controller.signal.aborted&&(!lastWs||Date.now()-lastWs>=5000)){setError(reason instanceof Error?reason.message:"Нет связи с биржей.");delay=Math.max(delay,Math.min(30000,1000*2**Math.min(++failures,5)));}}
      finally{if(!controller.signal.aborted)timer=setTimeout(()=>void poll(),delay);}
    }
    void poll();const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{controller.abort();stop();clearTimeout(timer);clearInterval(clock);};
  },[pair,revision,enabled]);
  const stale=!!book&&!!now&&now-book.receivedAt>5000;
  return {book,error,mode,stale,refresh:()=>setRevision(value=>value+1)};
}
