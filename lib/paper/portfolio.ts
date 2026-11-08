import type {ExchangeId} from "@/lib/market/types";
import type {OrderBook} from "@/lib/market/orderbook/model";
import {paperDecimals,type PaperBalance,type PaperFill,type PaperOrder} from "./account";
export interface PaperPosition {key:string;exchange:ExchangeId;symbol:string;base:string;quote:string;marketQuote:string;quantity:number;cost:number;realized:number|null;average:number;available:number;availableCost?:number}
export interface VenueBalance {exchange:string;currency:string;availableUnits:number;reservedUnits:number;decimals:number}
export interface Portfolio {positions:PaperPosition[];venueBalances:VenueBalance[];unassigned:PaperBalance[];blockedOrders:string[]}
type Lot={exchange:string;base:string;quote:string;symbol:string;quantity:number;cost:number};
/** Replay executions, not limit prices. Deposits remain in the funding wallet until used. */
export function paperPortfolio(balances:PaperBalance[],fills:PaperFill[],orders:PaperOrder[]):Portfolio{
  const holdings=new Map<string,number>(),net=new Map<string,number>(),wallet=new Map<string,number>(),lots:Lot[]=[],realized=new Map<string,number|null>(),instruments=new Map<string,PaperFill>();
  const key=(exchange:string,currency:string)=>`${exchange}:${currency}`;
  const quantity=(f:PaperFill)=>f.quantityAtoms/1e8;
  for(const f of fills){const q=quantity(f),amount=(f.settlementUnits+(f.side==="buy"?f.feeUnits:-f.feeUnits))/10**paperDecimals(f.settlementCurrency);net.set(f.base,(net.get(f.base)||0)+(f.side==="buy"?q:-q));net.set(f.settlementCurrency,(net.get(f.settlementCurrency)||0)+(f.side==="buy"?-amount:amount));}
  for(const b of balances)wallet.set(b.currency,Math.max(0,(b.availableUnits+b.reservedUnits)/10**b.decimals-(net.get(b.currency)||0)));
  function debit(exchange:string,currency:string,amount:number){const k=key(exchange,currency),local=holdings.get(k)||0,take=Math.min(local,amount);holdings.set(k,local-take);amount-=take;const funded=Math.min(wallet.get(currency)||0,amount);wallet.set(currency,(wallet.get(currency)||0)-funded);amount-=funded;
    // Reconcile historical cross-exchange executions made before venue isolation existed.
    for(const [other,held] of holdings){if(amount<1e-10)break;if(other!==k&&other.endsWith(`:${currency}`)){const used=Math.min(held,amount);holdings.set(other,held-used);amount-=used;}}
  }
  for(const f of fills){
    const q=quantity(f),amount=(f.settlementUnits+(f.side==="buy"?f.feeUnits:-f.feeUnits))/10**paperDecimals(f.settlementCurrency),group=`${f.exchange}:${f.base}:${f.settlementCurrency}`;instruments.set(group,f);
    debit(f.exchange,f.side==="buy"?f.settlementCurrency:f.base,f.side==="buy"?amount:q);
    const receive=key(f.exchange,f.side==="buy"?f.base:f.settlementCurrency);holdings.set(receive,(holdings.get(receive)||0)+(f.side==="buy"?q:amount));
    if(f.side==="buy"){
      let spent=amount;for(const lot of lots.filter(l=>l.exchange===f.exchange&&l.base===f.settlementCurrency&&l.quantity>0)){const take=Math.min(lot.quantity,spent);lot.cost*=1-take/lot.quantity;lot.quantity-=take;spent-=take;if(spent<1e-10)break;}
      lots.push({exchange:f.exchange,base:f.base,quote:f.settlementCurrency,symbol:f.symbol,quantity:q,cost:amount});
    }
    else{let remaining=q,cost=0,known=true;for(const lot of lots.filter(l=>l.exchange===f.exchange&&l.base===f.base&&l.quantity>0)){const used=Math.min(remaining,lot.quantity),basis=lot.cost*used/lot.quantity;if(lot.quote!==f.settlementCurrency)known=false;cost+=basis;lot.quantity-=used;lot.cost-=basis;remaining-=used;if(remaining<1e-10)break;}if(remaining>1e-8)known=false;const previous=realized.get(group);realized.set(group,known&&previous!==null?(previous||0)+amount-cost:null);}
  }
  const reserved=new Map<string,number>(),blockedOrders:string[]=[];
  for(const o of orders.filter(o=>["pending","open","partially_filled"].includes(o.status))){if(!o.reservedCurrency||!o.reservedUnits)continue;const currency=o.reservedCurrency,amount=o.reservedUnits/10**paperDecimals(currency),k=key(o.exchange,currency),local=holdings.get(k)||0,take=Math.min(local,amount),funded=Math.min(wallet.get(currency)||0,amount-take);holdings.set(k,local-take);wallet.set(currency,(wallet.get(currency)||0)-funded);reserved.set(k,(reserved.get(k)||0)+take+funded);if(amount-take-funded>1e-8)blockedOrders.push(o.id);}
  const venueBalances:VenueBalance[]=[...new Set([...holdings.keys(),...reserved.keys()])].map(k=>{const [exchange,currency]=k.split(":");return {exchange,currency,decimals:paperDecimals(currency),availableUnits:Math.round((holdings.get(k)||0)*10**paperDecimals(currency)),reservedUnits:Math.round((reserved.get(k)||0)*10**paperDecimals(currency))};});
  const positions:PaperPosition[]=[],availableBudget=new Map(venueBalances.map(b=>[`${b.exchange}:${b.currency}`,b.availableUnits/10**b.decimals])),quantityBudget=new Map(venueBalances.map(b=>[`${b.exchange}:${b.currency}`,(b.availableUnits+b.reservedUnits)/10**b.decimals]));
  for(const [group,f] of instruments){const owned=lots.filter(l=>`${l.exchange}:${l.base}:${l.quote}`===group&&l.quantity>1e-10),rawQuantity=owned.reduce((s,l)=>s+l.quantity,0),quantity=Math.min(rawQuantity,quantityBudget.get(key(f.exchange,f.base))||0),cost=owned.reduce((s,l)=>s+l.cost,0)*(rawQuantity?quantity/rawQuantity:0);if(!quantity&&!realized.has(group))continue;positions.push({key:group,exchange:f.exchange as ExchangeId,symbol:f.symbol,base:f.base,quote:f.settlementCurrency,marketQuote:f.quote,quantity,cost,average:quantity?cost/quantity:0,realized:realized.get(group)??(realized.has(group)?null:0),available:Math.min(quantity,availableBudget.get(key(f.exchange,f.base))||0)});availableBudget.set(key(f.exchange,f.base),Math.max(0,(availableBudget.get(key(f.exchange,f.base))||0)-positions[positions.length-1].available));quantityBudget.set(key(f.exchange,f.base),Math.max(0,(quantityBudget.get(key(f.exchange,f.base))||0)-quantity));}
  for(const position of positions){let remaining=position.available,cost=0;for(const lot of lots.filter(l=>l.exchange===position.exchange&&l.base===position.base&&l.quote===position.quote&&l.quantity>0)){const take=Math.min(remaining,lot.quantity);cost+=lot.cost*take/lot.quantity;remaining-=take;if(remaining<1e-10)break;}position.availableCost=cost;}
  return {positions,venueBalances,unassigned:balances.map(b=>({...b,availableUnits:Math.round((wallet.get(b.currency)||0)*10**b.decimals),reservedUnits:0})),blockedOrders};
}
export function estimatePosition(position:PaperPosition,book:OrderBook|undefined,now=Date.now()){
  const quantity=position.available,breakEven=position.average/.999;
  if(position.marketQuote!==position.quote)return {status:"currency" as const,breakEven};
  if(!book||book.exchange!==position.exchange||book.symbol!==position.symbol||now-book.receivedAt>5000||book.receivedAt>now+1000||book.exchangeTime!==null&&(now-book.exchangeTime>15000||book.exchangeTime>now+5000))return {status:"stale" as const,breakEven};
  let remaining=quantity,gross=0;
  for(const level of book.bids){const take=Math.min(remaining,level.quantity);gross+=take*level.price;remaining-=take;if(remaining<1e-10)break;}
  if(quantity<=0)return {status:"reserved" as const,breakEven};
  if(remaining>1e-8)return {status:"depth" as const,breakEven,covered:quantity-remaining};
  const scale=10**paperDecimals(position.quote),units=Math.floor(gross*scale+1e-7),fee=Math.ceil(units/1000)/scale,net=units/scale-fee,cost=position.availableCost??position.average*quantity,pnl=net-cost;
  return {status:"ok" as const,breakEven,net,fee,pnl,percent:cost?pnl/cost*100:0,quantity};
}
