import "server-only";
import {z} from "zod";
import {COIN_IDS,normalizeCoinInfo,safeCoinUrl} from "@/lib/market/coin-info";
import {findCoinCandidates,matchCoinMarket,sameProjectName,type CoinCandidate,type CoinProvider} from "@/lib/market/coin-catalog";
import {mergeCoinProfiles,normalizePaprikaInfo,type CoinProfile} from "@/lib/market/coin-profile";
import type {ExchangeId} from "@/lib/market/types";
import {coinNames} from "@/lib/market/format";
import {coinCatalog,coinSourceJson,coinSourceText} from "./coin-sources";
import {parseOKXCoinPage} from "@/lib/market/coin-exchange-profile";
import {verifiedCoinHistory} from "@/lib/market/verified-coin-history";
const cache=new Map<string,{data:CoinProfile;expires:number}>(),pending=new Map<string,Promise<CoinProfile>>(),failures=new Map<string,number>();
const marketCache=new Map<string,CoinCandidate>();
const exchangeIds:Record<ExchangeId,string>={binance:"binance",bybit:"bybit_spot",okx:"okex",bitget:"bitget",gate:"gate",kraken:"kraken",coinbase:"gdax",kucoin:"kucoin",bitfinex:"bitfinex",htx:"huobi",mexc:"mxc",whitebit:"whitebit",cryptocom:"crypto_com",bingx:"bingx"};
export class CoinInfoError extends Error {constructor(message:string,public status:number){super(message);}}
export interface CoinInfoOptions {id?:string;provider?:CoinProvider;exchange?:ExchangeId;quote?:string}
export type CoinResolution={data:CoinProfile;stale:boolean}|{candidates:CoinCandidate[]};
async function wikipedia(profile:CoinProfile):Promise<CoinProfile>{
  try{
    const summary=z.object({type:z.string().optional(),title:z.string(),extract:z.string(),content_urls:z.object({desktop:z.object({page:z.string()})})}).parse(await coinSourceJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(profile.name.replace(/ /g,"_"))}`));
    if(summary.type==="disambiguation"||!sameProjectName(summary.title,profile.name)||!/(cryptocurrenc|blockchain|cryptoasset|decentralized finance|digital token)/i.test(summary.extract))return profile;
    const url=safeCoinUrl(summary.content_urls.desktop.page);if(!url||new URL(url).hostname!=="en.wikipedia.org")return profile;
    return {...profile,description:profile.description||summary.extract,history:summary.extract,historySource:{name:"Wikipedia",url},additionalSources:[...profile.additionalSources||[],{name:"Wikipedia",url}]};
  }catch{return profile;}
}
async function rawProfile(candidate:CoinCandidate):Promise<CoinProfile>{
  if(candidate.provider==="coinpaprika")return normalizePaprikaInfo(await coinSourceJson(`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(candidate.id)}`),candidate);
  return {...normalizeCoinInfo(await coinSourceJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(candidate.id)}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`),candidate.symbol,candidate.id),sourceName:"CoinGecko"};
}
async function loadProfile(candidate:CoinCandidate):Promise<CoinProfile>{
  let profile:CoinProfile;
  try{profile=await rawProfile(candidate);}
  catch(error){
    if(candidate.provider!=="coingecko")throw error;
    const alternatives=findCoinCandidates(await coinCatalog("coinpaprika"),candidate.symbol).filter(coin=>sameProjectName(coin.name,candidate.name));
    if(alternatives.length!==1)throw error;
    profile=await rawProfile(alternatives[0]);
  }
  if(profile.sourceName==="CoinGecko")try{
    const alternatives=findCoinCandidates(await coinCatalog("coinpaprika"),candidate.symbol).filter(coin=>sameProjectName(coin.name,profile.name));
    if(alternatives.length===1)profile=mergeCoinProfiles(profile,await rawProfile(alternatives[0]));
  }catch{/* Primary information remains available when the secondary source is down. */}
  const [wiki,exchange]=await Promise.all([wikipedia(profile),(async()=>{
    try{
      const slug=`${profile.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${candidate.symbol.toLowerCase()}`;
      const url=`https://www.okx.com/price/${encodeURIComponent(slug)}`,page=parseOKXCoinPage(await coinSourceText(url),profile.name,candidate.symbol);
      return page?{...page,url}:undefined;
    }catch{return undefined;}
  })()]);
  if(!exchange)return verifiedCoinHistory(wiki);
  return verifiedCoinHistory({...wiki,description:wiki.description||exchange.text,exchangeDescription:{text:exchange.text,name:"OKX",url:exchange.url},links:[...wiki.links,...exchange.links.filter(link=>!wiki.links.some(other=>other.url===link.url))]});
}
async function resolveCandidate(asset:string,options:CoinInfoOptions):Promise<CoinCandidate|CoinCandidate[]>{
  let candidates:CoinCandidate[]=[];
  const provider=options.provider||"coingecko",pinned=Object.hasOwn(COIN_IDS,asset)?COIN_IDS[asset]:undefined;
  if(!options.id&&provider==="coingecko"&&pinned)return {id:pinned,symbol:asset,name:coinNames[asset]||asset,provider};
  let catalogFailed=false;
  try{candidates=findCoinCandidates(await coinCatalog(provider),asset);}catch{catalogFailed=true;}
  if(options.id){
    const candidate=candidates.find(coin=>coin.id===options.id);
    if(!candidate)throw new CoinInfoError(catalogFailed?"Не удалось проверить проект в каталоге. Повторите позже.":"Выбранный проект не соответствует тикеру монеты.",catalogFailed?503:400);
    return candidate;
  }
  if(candidates.length===1)return candidates[0];
  if(candidates.length>1){
    if(provider==="coingecko"&&options.exchange){
      const key=`${options.exchange}:${asset}:${options.quote||"USDT"}`,known=marketCache.get(key);
      if(known&&candidates.some(coin=>coin.id===known.id))return known;
      try{
        const url=`https://api.coingecko.com/api/v3/exchanges/${exchangeIds[options.exchange]}/tickers?coin_ids=${encodeURIComponent(candidates.map(coin=>coin.id).join(","))}&depth=false`;
        const matched=matchCoinMarket(candidates,await coinSourceJson(url),asset,options.quote||"USDT");
        if(matched){if(marketCache.size>=500)marketCache.delete(marketCache.keys().next().value!);marketCache.set(key,matched);return matched;}
      }catch{/* Never guess by popularity if exact exchange identification is unavailable. */}
    }
    return candidates;
  }
  if(provider==="coingecko")try{
    const secondary=findCoinCandidates(await coinCatalog("coinpaprika"),asset);
    if(secondary.length===1)return secondary[0];
    if(secondary.length>1)return secondary;
  }catch{catalogFailed=true;}
  throw new CoinInfoError(catalogFailed?"Источники описаний временно недоступны. Котировки биржи продолжают работать.":`Для ${asset} пока нет карточки в CoinGecko и CoinPaprika. Историю и автора проекта подтвердить не удалось.`,catalogFailed?503:404);
}
export async function getCoinInfo(asset:string,options:CoinInfoOptions={}):Promise<CoinResolution>{
  const candidate=await resolveCandidate(asset,options);
  if(Array.isArray(candidate))return {candidates:candidate};
  const key=`${candidate.provider}:${candidate.id}`,cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return {data:cached.data,stale:false};
  if((failures.get(key)||0)>Date.now()){
    if(cached)return {data:cached.data,stale:true};
    throw new CoinInfoError("Источники описания временно недоступны. Попробуйте через минуту.",503);
  }
  let request=pending.get(key);
  if(!request){request=loadProfile(candidate);pending.set(key,request);}
  try{
    const data=await request;
    if(cache.size>=300&&!cache.has(key))cache.delete(cache.keys().next().value!);
    cache.set(key,{data,expires:Date.now()+600000});failures.delete(key);
    return {data,stale:false};
  }catch{
    if(failures.size>=500)failures.delete(failures.keys().next().value!);
    failures.set(key,Date.now()+60000);
    if(cached)return {data:cached.data,stale:true};
    throw new CoinInfoError("Не удалось загрузить описание из CoinGecko и CoinPaprika. Котировки выбранной биржи доступны выше.",503);
  }finally{if(pending.get(key)===request)pending.delete(key);}
}
