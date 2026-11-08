import {z} from "zod";
export type CoinProvider="coingecko"|"coinpaprika";
export interface CoinCandidate {id:string;symbol:string;name:string;provider:CoinProvider}
const catalogSchema=z.array(z.object({id:z.string().min(1).max(180),symbol:z.string(),name:z.string(),is_active:z.boolean().optional()}));
export function parseCoinCatalog(input:unknown,provider:CoinProvider):CoinCandidate[]{
  return catalogSchema.parse(input).filter(coin=>coin.is_active!==false).map(coin=>({id:coin.id,symbol:coin.symbol.toUpperCase(),name:coin.name,provider}));
}
export function findCoinCandidates(catalog:CoinCandidate[],asset:string){return catalog.filter(coin=>coin.symbol===asset.toUpperCase());}
export function matchCoinMarket(candidates:CoinCandidate[],input:unknown,asset:string,quote:string):CoinCandidate|undefined{
  const schema=z.object({tickers:z.array(z.object({base:z.string(),target:z.string(),coin_id:z.string().nullish()}))});
  const result=schema.safeParse(input);if(!result.success)return;
  const ids=new Set(result.data.tickers.filter(ticker=>ticker.base.toUpperCase()===asset&&ticker.target.toUpperCase()===quote).map(ticker=>ticker.coin_id));
  const matches=candidates.filter(candidate=>ids.has(candidate.id));
  return matches.length===1?matches[0]:undefined;
}
export function sameProjectName(first:string,second:string){
  const normalize=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  return normalize(first)===normalize(second);
}
