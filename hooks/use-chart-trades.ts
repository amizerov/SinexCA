"use client";
import {useEffect,useState} from "react";
import {useAccount} from "@/components/Account";
import type {ExchangeId} from "@/lib/market/types";
import type {DemoFill} from "@/lib/paper/orders";
export function useChartTrades(exchange:ExchangeId,symbol:string|undefined,from:number|undefined,to:number|undefined){
  const {session}=useAccount(),owner=session?.ownerId,key=JSON.stringify([owner,exchange,symbol,from,to]);
  const [result,setResult]=useState<{key:string;fills:DemoFill[];truncated:boolean;error?:string}>();
  useEffect(()=>{
    if(!owner||!symbol||from===undefined||to===undefined)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const query=new URLSearchParams({exchange,symbol:symbol!,from:String(from),to:String(to)}),r=await fetch(`/api/paper/chart-trades?${query}`,{cache:"no-store",signal:controller.signal}),j=await r.json();if(!r.ok)throw new Error(j.error?.message||"Не удалось загрузить сделки");if(j.ownerId!==owner)throw new Error("Аккаунт изменился");if(!controller.signal.aborted)setResult({key,fills:j.fills,truncated:j.truncated});}catch(e){if(!controller.signal.aborted)setResult({key,fills:[],truncated:false,error:e instanceof Error?e.message:"Нет связи с историей сделок"});}finally{if(!controller.signal.aborted)timer=setTimeout(load,5000);}}
    void load();return()=>{controller.abort();clearTimeout(timer);};
  },[owner,exchange,symbol,from,to,key]);
  return result?.key===key?result:{fills:[],truncated:false,error:undefined};
}
