import "server-only";
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomUUID} from "node:crypto";
import {TtlCache} from "./cache";
import {parseCoinCatalog,type CoinProvider,type CoinCandidate} from "@/lib/market/coin-catalog";

const cache=new TtlCache(250),catalogMemory=new Map<CoinProvider,{coins:CoinCandidate[];time:number}>();
const cooldown=new Map<string,number>();
const pending=new Map<CoinProvider,Promise<CoinCandidate[]>>();
export async function coinSourceText(url:string):Promise<string>{
  const host=new URL(url).host;
  if((cooldown.get(host)||0)>Date.now())throw new Error("Source rate limited");
  return cache.get(url,600000,async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:"no-store",headers:{Accept:"application/json","User-Agent":"SinexBroker/1.0 (public coin information)"}});
    if(response.status===429){cooldown.set(host,Date.now()+Math.max(60000,Math.min(900000,(Number(response.headers.get("retry-after"))||60)*1000)));throw new Error("Source rate limited");}
    if(!response.ok)throw new Error(`Source HTTP ${response.status}`);
    return response.text();
  });
}
export async function coinSourceJson(url:string):Promise<unknown>{return JSON.parse(await coinSourceText(url));}
export async function coinCatalog(provider:CoinProvider):Promise<CoinCandidate[]>{
  const current=catalogMemory.get(provider);if(current&&Date.now()-current.time<86400000)return current.coins;
  const active=pending.get(provider);if(active)return active;
  const request=(async()=>{
    const directory=resolve(/*turbopackIgnore: true*/"data/coin-catalogs"),path=join(directory,`${provider}.json`);
    let saved=current;
    if(!saved)try{const file=JSON.parse(await readFile(path,"utf8"));if(Array.isArray(file.coins)&&typeof file.time==="number")saved={coins:parseCoinCatalog(file.coins,provider),time:file.time};}catch{/* A missing or invalid cache is refreshed from the source. */}
    if(saved&&Date.now()-saved.time<86400000){catalogMemory.set(provider,saved);return saved.coins;}
    try{
      const coins=parseCoinCatalog(await coinSourceJson(provider==="coingecko"?"https://api.coingecko.com/api/v3/coins/list":"https://api.coinpaprika.com/v1/coins"),provider),value={coins,time:Date.now()};
      if(!coins.length)throw new Error("Empty catalog");
      catalogMemory.set(provider,value);
      try{await mkdir(directory,{recursive:true});const temporary=join(directory,`${provider}-${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(value),"utf8");await rename(temporary,path);}catch{/* Read-only hosting still has the memory cache. */}
      return coins;
    }catch(error){if(saved){catalogMemory.set(provider,{...saved,time:Date.now()-86340000});return saved.coins;}throw error;}
  })();
  pending.set(provider,request);
  try{return await request;}finally{pending.delete(provider);}
}
