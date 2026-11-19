import type {ExchangeId,TradingPair} from "../types";
import type {OrderBook} from "../orderbook/model";
export const COMPARISON_ASSETS=["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","TRX","LINK","AVAX","SUI","LTC","BCH","DOT","NEAR","UNI","APT","TON","PEPE","AAVE"] as const;
export const QUOTE_MAX_AGE=15000;
export interface ComparisonQuote {exchange:ExchangeId;asset:string;symbol:string;bid:number|null;ask:number|null;bidSize:number|null;askSize:number|null;last:number|null;receivedAt:number;source:"ws"|"rest"}
export interface VenueSnapshot {exchange:ExchangeId;status:"connecting"|"live"|"rest"|"error";error:string;quotes:ComparisonQuote[];available:string[]}
export interface Opportunity {asset:string;buy:ComparisonQuote;sell:ComparisonQuote;grossPercent:number;netPercent:number;estimatedProfit:number;quantity:number;topSizeSufficient:boolean|null}
export const freshQuote=(quote:ComparisonQuote,now:number)=>Number.isFinite(quote.receivedAt)&&now-quote.receivedAt>=-1000&&now-quote.receivedAt<=QUOTE_MAX_AGE;
export function opportunities(quotes:ComparisonQuote[],fees:Partial<Record<ExchangeId,number>>,budget:number,now:number):Opportunity[]{
  if(!Number.isFinite(budget)||budget<=0)return [];
  const result:Opportunity[]=[];
  for(const buy of quotes)for(const sell of quotes){
    if(buy.asset!==sell.asset||buy.exchange===sell.exchange||!freshQuote(buy,now)||!freshQuote(sell,now)||Math.abs(buy.receivedAt-sell.receivedAt)>5000)continue;
    if(!buy.ask||!Number.isFinite(buy.ask)||buy.ask<=0||!sell.bid||!Number.isFinite(sell.bid)||sell.bid<=0)continue;
    const buyFee=fees[buy.exchange],sellFee=fees[sell.exchange];
    if(buyFee===undefined||sellFee===undefined||![buyFee,sellFee].every(f=>Number.isFinite(f)&&f>=0&&f<=5))continue;
    const quantity=budget/(buy.ask*(1+buyFee/100)),revenue=quantity*sell.bid*(1-sellFee/100);
    const topSizeSufficient=buy.askSize===null||sell.bidSize===null?null:buy.askSize>=quantity&&sell.bidSize>=quantity;
    result.push({asset:buy.asset,buy,sell,quantity,grossPercent:(sell.bid/buy.ask-1)*100,netPercent:(revenue/budget-1)*100,estimatedProfit:revenue-budget,topSizeSufficient});
  }
  return result.sort((a,b)=>b.netPercent-a.netPercent);
}
export function pairForAsset(pairs:TradingPair[],asset:string){
  const matches=pairs.filter(pair=>pair.marketType==="spot"&&pair.baseAsset===asset&&pair.quoteAsset==="USDT");
  return matches.length===1?matches[0]:undefined;
}
/** Fees assumed charged in quote currency; never extrapolate past published book depth. */
export function depthEstimate(buy:OrderBook,sell:OrderBook,budget:number,buyFee:number,sellFee:number,now:number){
  if(![budget,buyFee,sellFee].every(Number.isFinite)||budget<=0||buyFee<0||sellFee<0||buyFee>5||sellFee>5)throw new Error("Некорректная сумма или комиссия.");
  if(buy.exchange===sell.exchange)throw new Error("Выберите разные биржи.");
  if([buy,sell].some(book=>now-book.receivedAt>5000||now-book.receivedAt< -1000)||Math.abs(buy.receivedAt-sell.receivedAt)>3000)throw new Error("Стаканы устарели или получены в разное время. Повторите проверку.");
  const valid=(rows:OrderBook["asks"])=>rows.length>0&&rows.every(row=>Number.isFinite(row.price)&&row.price>0&&Number.isFinite(row.quantity)&&row.quantity>=0);
  if(!valid(buy.asks)||!valid(sell.bids))throw new Error("Нет достоверной глубины стакана.");
  let remaining=budget/(1+buyFee/100),quantity=0,spent=0;
  for(const level of [...buy.asks].sort((a,b)=>a.price-b.price)){
    const fill=Math.min(level.quantity,remaining/level.price);quantity+=fill;spent+=fill*level.price;remaining=Math.max(0,remaining-fill*level.price);if(remaining<=budget*1e-10)break;
  }
  if(remaining>budget*1e-8)return {complete:false as const,reason:"Недостаточно глубины покупки для указанной суммы."};
  let toSell=quantity,proceeds=0;
  for(const level of [...sell.bids].sort((a,b)=>b.price-a.price)){const fill=Math.min(level.quantity,toSell);proceeds+=fill*level.price;toSell=Math.max(0,toSell-fill);if(toSell<=quantity*1e-10)break;}
  if(toSell>quantity*1e-8)return {complete:false as const,reason:"Недостаточно глубины продажи для купленного количества."};
  const totalCost=spent*(1+buyFee/100),netProceeds=proceeds*(1-sellFee/100);
  return {complete:true as const,quantity,buyAverage:spent/quantity,sellAverage:proceeds/quantity,totalCost,netProceeds,fees:spent*buyFee/100+proceeds*sellFee/100,profit:netProceeds-totalCost,percent:(netProceeds/totalCost-1)*100,receivedAt:Math.min(buy.receivedAt,sell.receivedAt)};
}
