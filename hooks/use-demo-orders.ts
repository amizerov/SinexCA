"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAccount} from "@/components/Account";
import type {DemoOrder,DemoFill} from "@/lib/paper/orders";
import type {PaperAccountSnapshot} from "@/lib/paper/account";
export interface DemoState {orders:DemoOrder[];fills:DemoFill[];account:PaperAccountSnapshot;health:{checkedAt:number;errors:string[]}}
export function useDemoOrders(){
  const {session}=useAccount(),owner=session?.ownerId,identity=useRef(owner);useEffect(()=>{identity.current=owner;},[owner]);
  const [result,setResult]=useState<{ownerId:string;data:DemoState}>(),[error,setError]=useState("");
  const sequence=useRef(0),applied=useRef(0);
  const request=useCallback(async(body?:unknown)=>{
    if(!owner)throw new Error("Подождите загрузки аккаунта");
    const version=++sequence.current;
    const r=await fetch("/api/paper/orders",{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json","X-Workspace-Id":owner}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"}),j=await r.json();
    if(identity.current!==owner)throw new Error("Аккаунт изменился");
    if(!r.ok)throw new Error(j.error?.message||"Не удалось получить заявки");if(j.ownerId!==owner)throw new Error("Аккаунт изменился");
    if(version>=applied.current){applied.current=version;setResult({ownerId:owner,data:j});setError("");}return j as DemoState;
  },[owner]);
  useEffect(()=>{
    if(!owner)return;let stopped=false,fetching=false,timer:ReturnType<typeof setTimeout>;
    async function load(){if(stopped||document.hidden||fetching)return;fetching=true;try{await request();}catch(e){if(!stopped)setError(e instanceof Error?e.message:"Нет связи с DEMO-счётом");}finally{fetching=false;if(!stopped&&!document.hidden)timer=setTimeout(load,2500);}}
    const visibility=()=>{clearTimeout(timer);if(!document.hidden)void load();};
    document.addEventListener("visibilitychange",visibility);void load();
    return()=>{stopped=true;clearTimeout(timer);document.removeEventListener("visibilitychange",visibility);};
  },[owner,request]);
  return {data:result&&result.ownerId===owner?result.data:undefined,error,request};
}
