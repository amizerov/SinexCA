import type {ExchangeId} from "../types";
export interface BookLevel {price:number;quantity:number}
export interface OrderBook {exchange:ExchangeId;symbol:string;bids:BookLevel[];asks:BookLevel[];receivedAt:number;exchangeTime:number|null}
export const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function bookLevels(input:unknown):BookLevel[]{
  if(!Array.isArray(input)||input.length>10000)throw new Error("Invalid depth levels");
  return input.map(row=>{
    if(!Array.isArray(row)||row.length<2||![row[0],row[1]].every(v=>(typeof v==="string"&&v.trim()!=="")||typeof v==="number"))throw new Error("Invalid depth row");
    const price=Number(row[0]),quantity=Number(row[1]);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(quantity)||quantity<0||!Number.isFinite(price*quantity))throw new Error("Invalid depth values");
    return {price,quantity};
  });
}
/** Full snapshots only; quantity zero is absent liquidity, never an invented order. */
export function makeBook(exchange:ExchangeId,symbol:string,bids:unknown,asks:unknown,time?:unknown):OrderBook{
  const side=(raw:unknown,sign:number)=>[...new Map(bookLevels(raw).map(row=>[row.price,row])).values()].filter(row=>row.quantity>0).sort((a,b)=>sign*(a.price-b.price)).slice(0,20);
  const book={exchange,symbol,bids:side(bids,-1),asks:side(asks,1),receivedAt:Date.now(),exchangeTime:time!=null&&Number.isFinite(Number(time))&&Number(time)>0?Number(time):null};
  if(book.bids.length&&book.asks.length&&book.bids[0].price>=book.asks[0].price)throw new Error("Crossed depth snapshot");
  return book;
}
export function bookSpread(book:OrderBook){
  const bid=book.bids[0]?.price,ask=book.asks[0]?.price;if(!bid||!ask)return null;
  const decimals=(price:number)=>{const [mantissa,exponent="0"]=String(price).toLowerCase().split("e");return Math.max(0,(mantissa.split(".")[1]?.length||0)-Number(exponent));};
  const value=Number((ask-bid).toFixed(Math.min(20,Math.max(decimals(bid),decimals(ask)))));
  return {value,percent:value/((ask+bid)/2)*100};
}
const priceFormatter=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:12});
export function bookNumber(value:number){return priceFormatter.format(value);}
