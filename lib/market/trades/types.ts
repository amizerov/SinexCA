import type { TradingPair } from "../types";
export interface TradeTick {symbol:string;price:number;time:number;receivedAt:number;quantity?:number;side?:"buy"|"sell";id?:string}
export interface TradeProtocol {url:string;subscriptions:unknown[];subscribeDelayMs?:number;ping?:unknown;pingMs?:number;decode:(input:unknown)=>TradeTick[];reply?:(input:unknown)=>unknown;isSubscribed?:(input:unknown)=>boolean}
export type TradeFactory=(pairs:TradingPair[],signal:AbortSignal)=>TradeProtocol|Promise<TradeProtocol>;
export const record=(input:unknown):Record<string,unknown>=>input!==null&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
export const rows=(input:unknown):unknown[]=>Array.isArray(input)?input:[];
export function tick(symbol:unknown,price:unknown,time:unknown,quantity?:unknown,side?:unknown,id?:unknown):TradeTick[]{const p=Number(price),t=Number(time),q=Number(quantity),s=typeof side==="string"?side.toLowerCase():undefined;return typeof symbol==="string"&&Number.isFinite(p)&&p>0&&Number.isFinite(t)&&t>0?[{symbol,price:p,time:Math.floor(t),receivedAt:Date.now(),...Number.isFinite(q)&&q>0?{quantity:q}:{},...s==="buy"||s==="sell"?{side:s as "buy"|"sell"}:{},...typeof id==="string"||typeof id==="number"?{id:String(id)}:{}}]:[];}
