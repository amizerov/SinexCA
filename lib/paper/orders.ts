import {z} from "zod";
import {EXCHANGE_IDS} from "@/lib/market/exchange-config";
export const orderNames={limit:"Лимит",market:"Маркет",stop_limit:"Стоп-лимит",stop_market:"Стоп-маркет"} as const;
export type OrderType=keyof typeof orderNames;
export const orderInput=z.object({mutationId:z.uuid(),exchange:z.enum(EXCHANGE_IDS),symbol:z.string().min(1).max(100),side:z.enum(["buy","sell"]),type:z.enum(["limit","market","stop_limit","stop_market"]),quantity:z.string().regex(/^\d+(\.\d{1,8})?$/),limit:z.number().positive().max(1e12).optional(),stop:z.number().positive().max(1e12).optional(),slippage:z.number().min(0.1).max(10).default(1)}).strict().superRefine((v,c)=>{if(v.type.endsWith("limit")&&!v.limit)c.addIssue({code:"custom",message:"Укажите лимитную цену"});if(v.type.startsWith("stop")&&!v.stop)c.addIssue({code:"custom",message:"Укажите стоп-цену"});});
export type OrderInput=z.infer<typeof orderInput>;
export interface DemoOrder {id:string;accountId:string;exchange:OrderInput["exchange"];symbol:string;base:string;quote:string;side:"buy"|"sell";type:OrderType;quantity:number;filled:number;limit:number|null;stop:number|null;direction:"up"|"down";triggered:boolean;bound:number;reserved:number;status:"open"|"partially_filled"|"filled"|"cancelled";createdAt:number;updatedAt:number;lastBook:number;fee:number;cost:number;notional?:string;note:string}
export interface DemoFill {exchange?:OrderInput["exchange"];symbol?:string;base?:string;quote?:string;side?:"buy"|"sell";id:string;orderId:string;price:number;quantity:number;quoteUnits:number;feeUnits:number;receivedAt:number;exchangeTime:number|null}
export const isOpen=(o:DemoOrder)=>o.status==="open"||o.status==="partially_filled";
export const ATOMS=100_000_000;
export function quantityAtoms(s:string){const [w,f=""]=s.split(".");const n=BigInt(w)*BigInt(ATOMS)+BigInt(f.padEnd(8,"0"));if(n<=BigInt(0)||n>BigInt(1e15))throw new Error("Количество должно быть от 0,00000001 до 10 000 000");return Number(n);}
/** Price rounded to 12 decimal places; cash rounds up for buys, down for sells. */
export function notional(atoms:number,price:number){return BigInt(atoms)*BigInt(price.toFixed(12).replace(".",""));}
export function cashNotional(raw:bigint,decimals:number,up:boolean){const den=BigInt(ATOMS)*BigInt(1e12),num=raw*BigInt(10)**BigInt(decimals);const value=Number((num+(up?den-BigInt(1):BigInt(0)))/den);if(!Number.isSafeInteger(value)||value>1e15)throw new Error("Сумма заявки превышает лимит");return value;}
export function cash(atoms:number,price:number,decimals:number,up:boolean){return cashNotional(notional(atoms,price),decimals,up);}
export const demoFee=(units:number)=>Math.ceil(units/1000);
export const orderLabel=(o:DemoOrder)=>`${o.side==="buy"?"Покупка":"Продажа"} · ${orderNames[o.type]}`;
