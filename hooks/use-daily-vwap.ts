"use client";
import {useEffect,useMemo,useState} from "react";
import type {Candle,ExchangeId,Timeframe} from "@/lib/market/types";
import {mergeCandles} from "@/lib/market/normalize";
import {dailyVwap,isVwapTimeframe,utcSession} from "@/lib/indicators/vwap";
import type {SessionHistory} from "@/lib/indicators/vwap-history";
export function useDailyVwap(exchange:ExchangeId,symbol:string,timeframe:Timeframe,enabled:boolean,updates:Candle[]){
  const [day,setDay]=useState(()=>utcSession(Date.now()/1000)),[revision,setRevision]=useState(0);
  const sessionDay=Math.max(day,utcSession(updates.at(-1)?.time??day));
  const active=enabled&&isVwapTimeframe(timeframe),key=`${exchange}:spot:${symbol}:${timeframe}:${sessionDay}`;
  const [state,setState]=useState<{key:string;data?:SessionHistory;error?:string}>();
  useEffect(()=>{if(!active)return;const clock=setInterval(()=>setDay(utcSession(Date.now()/1000)),10000);return()=>clearInterval(clock);},[active]);
  useEffect(()=>{
    if(!active||!symbol)return;const controller=new AbortController();let fetching=false;
    async function load(){if(document.hidden||fetching)return;fetching=true;try{
      const response=await fetch(`/api/market/vwap-history?${new URLSearchParams({exchange,symbol,timeframe})}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])}),json=await response.json();
      if(!response.ok)throw new Error(json.error?.message||"Не удалось загрузить историю VWAP.");
      if(!json.data||!Array.isArray(json.data.candles)||!Number.isFinite(json.data.sessionStart))throw new Error("Сервер вернул некорректную историю VWAP.");
      if(!controller.signal.aborted)setState({key,data:json.data});
    }catch(error){if(!controller.signal.aborted)setState({key,error:error instanceof Error?error.message:"Не удалось загрузить историю VWAP."});}finally{fetching=false;}}
    void load();const visible=()=>{if(!document.hidden)void load();};document.addEventListener("visibilitychange",visible);
    return()=>{controller.abort();document.removeEventListener("visibilitychange",visible);};
  },[active,exchange,symbol,timeframe,key,revision]);
  const current=state?.key===key?state:undefined;
  const data=current?.data;
  const history=useMemo(()=>data?mergeCandles(data.candles,updates,100000):[],[data,updates]);
  const session=useMemo(()=>dailyVwap(history,timeframe).find(session=>session.start===sessionDay),[history,timeframe,sessionDay]);
  const warning=!enabled?"":!active?"Дневной VWAP доступен только на внутридневных интервалах.":current?.error?current.error:current?.data&&!session?.complete?"VWAP: биржа не вернула полную историю с 00:00 UTC. Линия не показана.":"";
  return {history:active&&session?.complete?history:[],loading:active&&!current,warning,refresh:()=>setRevision(value=>value+1),value:active&&session?.complete?session.points.at(-1)?.value:undefined};
}
