import { z } from "zod";

// Explicit IDs avoid confusing unrelated tokens that share a ticker symbol.
export const COIN_IDS:Record<string,string>={BTC:"bitcoin",ETH:"ethereum",SOL:"solana",BNB:"binancecoin",XRP:"ripple",DOGE:"dogecoin",ADA:"cardano",TRX:"tron",LINK:"chainlink",AVAX:"avalanche-2",SUI:"sui",LTC:"litecoin",BCH:"bitcoin-cash",DOT:"polkadot",NEAR:"near",UNI:"uniswap",APT:"aptos",TON:"the-open-network",PEPE:"pepe",AAVE:"aave",SHIB:"shiba-inu",ICP:"internet-computer",ETC:"ethereum-classic",ATOM:"cosmos",FIL:"filecoin",RENDER:"render-token",ARB:"arbitrum",OP:"optimism"};
const number=z.number().finite().nullish().transform(value=>value??null);
const usd=z.object({usd:number}).nullish().transform(value=>value?.usd??null);
const date=z.string().nullish().transform(value=>value&&!Number.isNaN(Date.parse(value))?value:null);
const usdDate=z.object({usd:date}).nullish().transform(value=>value?.usd??null);
const marketSchema=z.object({current_price:usd,market_cap:usd,fully_diluted_valuation:usd,total_volume:usd,high_24h:usd,low_24h:usd,circulating_supply:number,total_supply:number,max_supply:number,ath:usd,ath_date:usdDate,atl:usd,atl_date:usdDate,price_change_percentage_24h:number,price_change_percentage_7d:number,price_change_percentage_30d:number,price_change_percentage_1y:number});
const schema=z.object({id:z.string(),symbol:z.string(),name:z.string(),description:z.object({ru:z.string().optional(),en:z.string().optional()}).optional(),market_cap_rank:number,genesis_date:date,hashing_algorithm:z.string().nullish(),categories:z.array(z.string()).default([]),platforms:z.record(z.string(),z.string().nullable()).default({}),links:z.object({homepage:z.array(z.string()).optional(),whitepaper:z.string().nullish(),blockchain_site:z.array(z.string()).optional(),subreddit_url:z.string().nullish(),twitter_screen_name:z.string().nullish(),repos_url:z.object({github:z.array(z.string()).optional()}).optional()}).optional(),market_data:marketSchema.optional(),last_updated:date});
export function safeCoinUrl(value:string|null|undefined):string|null {
  if(!value)return null;
  try{const url=new URL(value);return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function plainCoinText(value:string){return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<\/(?:p|div)>/gi,"\n\n").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim().slice(0,12000);}
export function normalizeCoinInfo(input:unknown,asset:string,expectedId=Object.hasOwn(COIN_IDS,asset)?COIN_IDS[asset]:undefined){
  const value=schema.parse(input);
  if(!expectedId||value.id!==expectedId||value.symbol.toUpperCase()!==asset)throw new Error("Coin identity mismatch");
  const links:{label:string;url:string}[]=[];
  const add=(label:string,url:string|null|undefined)=>{const safe=safeCoinUrl(url);if(safe&&!links.some(link=>link.url===safe))links.push({label,url:safe});};
  value.links?.homepage?.slice(0,2).forEach(url=>add("Сайт проекта",url));
  add("Whitepaper",value.links?.whitepaper);
  value.links?.blockchain_site?.filter(Boolean).slice(0,2).forEach(url=>add("Обозреватель",url));
  value.links?.repos_url?.github?.slice(0,2).forEach(url=>add("GitHub",url));
  add("Reddit",value.links?.subreddit_url);
  if(value.links?.twitter_screen_name)add("X",`https://x.com/${encodeURIComponent(value.links.twitter_screen_name)}`);
  const ru=value.description?.ru?.trim();
  return {id:value.id,asset,name:value.name,description:plainCoinText(ru||value.description?.en||""),descriptionLanguage:ru?"ru":"en",rank:value.market_cap_rank,genesisDate:value.genesis_date,algorithm:value.hashing_algorithm||null,categories:value.categories.slice(0,12),contracts:Object.entries(value.platforms).filter(([network,address])=>network&&address).map(([network,address])=>({network,address:address!})),links,market:value.market_data??null,updatedAt:value.last_updated,sourceUrl:`https://www.coingecko.com/en/coins/${value.id}`};
}
export type CoinInfo=ReturnType<typeof normalizeCoinInfo>;
