import {EXCHANGES} from "./exchange-config";
import type {ExchangeId,TradingPair} from "./types";
const preferred=["USDT","USD","USDC","BTC","ETH","EUR","GBP"];
export function quoteAssets(pairs:TradingPair[]){return [...new Set(pairs.map(p=>p.quoteAsset))].sort((a,b)=>{
  const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);
});}
export function resolveQuote(pairs:TradingPair[]|undefined,exchange:ExchangeId,requested:string){
  if(requested==="all")return "all";
  const available=quoteAssets(pairs||[]),fallback=EXCHANGES[exchange].quote;
  return available.includes(requested)?requested:available.includes(fallback)?fallback:available[0]||fallback;
}
export function filterQuote(pairs:TradingPair[],quote:string){return quote==="all"?pairs:pairs.filter(p=>p.quoteAsset===quote);}
export function selectedPair(pairs:TradingPair[]|undefined,base:string,quote:string){
  return pairs?.find(p=>p.baseAsset===base&&p.quoteAsset===quote)||pairs?.find(p=>p.baseAsset===base)||pairs?.[0];
}
