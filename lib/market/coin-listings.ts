import type {ExchangeId,TradingPair} from "./types";
import {EXCHANGE_IDS,tradingUrl} from "./exchange-config";
export interface CoinListing {exchange:ExchangeId;pair:TradingPair;url:string}
export interface CoinListings {listings:CoinListing[];unavailable:ExchangeId[];checkedAt:string}
export async function findCoinListings(asset:string,getPairs:(exchange:ExchangeId)=>Promise<TradingPair[]>):Promise<CoinListings>{
  const results=await Promise.allSettled(EXCHANGE_IDS.map(exchange=>getPairs(exchange)));
  const listings:CoinListing[]=[],unavailable:ExchangeId[]=[];
  results.forEach((result,index)=>{
    const exchange=EXCHANGE_IDS[index];
    if(result.status==="rejected"){unavailable.push(exchange);return;}
    const pair=result.value.find(pair=>pair.exchange===exchange&&pair.marketType==="spot"&&pair.baseAsset===asset);
    if(pair)listings.push({exchange,pair,url:tradingUrl(exchange,pair)});
  });
  return {listings,unavailable,checkedAt:new Date().toISOString()};
}
