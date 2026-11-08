import {z} from "zod";
import type {Portfolio} from "./portfolio";
export const PAPER_SCALE=1_000_000;
export const MAX_DEPOSIT_UNITS=1_000_000*PAPER_SCALE;
export const MAX_BALANCE_UNITS=1_000_000_000*PAPER_SCALE;
export const PAPER_CURRENCIES=["USDT","USDC","USD","EUR","BTC","ETH","SOL","BNB","XRP","DOGE","ADA","TRX"] as const;
export type PaperCurrency=typeof PAPER_CURRENCIES[number];
export function paperDecimals(currency:string){return ["USDT","USDC","USD","EUR"].includes(currency)?6:8;}
export const paperDepositSchema=z.object({currency:z.enum(PAPER_CURRENCIES).default("USDT"),amount:z.string().trim().max(24).transform(value=>value.replace(",",".")),mutationId:z.uuid()}).strict().transform((input,context)=>{
  const decimals=paperDecimals(input.currency);
  if(!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(input.amount)){
    context.addIssue({code:"custom",path:["amount"],message:`Введите сумму с точностью до ${decimals} знаков после запятой`});return z.NEVER;
  }
  const [whole,fraction=""]=input.amount.split("."),scale=BigInt(10)**BigInt(decimals),units=BigInt(whole)*scale+BigInt(fraction.padEnd(decimals,"0"));
  if(units<=BigInt(0)||units>BigInt(1_000_000)*scale){context.addIssue({code:"custom",path:["amount"],message:`Сумма пополнения — от ${decimals===6?"0,000001":"0,00000001"} до 1 000 000 ${input.currency}`});return z.NEVER;}
  return {...input,amount:Number(units)};
});
export interface PaperBalance {currency:string;decimals:number;availableUnits:number;reservedUnits:number}
export interface PaperLedgerEntry {id:string;kind:string;currency:string;decimals:number;availableDelta:number;reservedDelta:number;availableAfter:number;reservedAfter:number;createdAt:number}
export interface PaperOrder {id:string;exchange:string;symbol:string;base?:string;quote?:string;side:string;orderType:string;status:string;quantityAtoms:number;filledAtoms:number;limitPriceAtoms:number|null;limitPrice?:number|null;stopPrice?:number|null;reservedUnits?:number;reservedCurrency?:string;triggered?:boolean;updatedAt?:number;createdAt:number}
export interface PaperFill {id:string;orderId:string;exchange:string;symbol:string;base:string;quote:string;side:string;price:number;quantityAtoms:number;settlementCurrency:string;settlementUnits:number;feeUnits:number;createdAt:number}
export interface PaperAccountSnapshot {id:string;mode:"paper";balances:PaperBalance[];operations:PaperLedgerEntry[];operationCount:number;deposits:PaperLedgerEntry[];depositCount:number;orders:PaperOrder[];orderCount:number;openOrderCount:number;fillCount:number;openOrders?:PaperOrder[];closedOrders?:PaperOrder[];fills?:PaperFill[];historyOffset?:number;portfolio?:Portfolio}
export function paperAmount(units:number,decimals=6){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:decimals,minimumFractionDigits:2}).format(units/10**decimals);}
export function paperOperationName(kind:string){return ({deposit:"Тестовое пополнение",transfer_in:"Перенос с гостевого счёта",transfer_out:"Перенос в аккаунт",reserve:"Резервирование",release:"Освобождение резерва",buy:"Тестовая покупка",sell:"Тестовая продажа",fee:"Тестовая комиссия"} as Record<string,string>)[kind]||kind;}
export function paperOrderStatus(status:string){return ({pending:"Ожидает",open:"Открыт",partially_filled:"Частично исполнен",filled:"Исполнен",cancelled:"Отменён",rejected:"Отклонён"} as Record<string,string>)[status]||status;}
