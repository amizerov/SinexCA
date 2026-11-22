import {z} from "zod";
import type {TradingPair} from "../market/types";
import type {OrderType} from "./orders";

export const orderPreferencesSchema=z.object({type:z.enum(["market","limit","stop_market","stop_limit"]),slippage:z.number().min(.1).max(10),leverage:z.number().finite().min(1),margin:z.enum(["isolated","cross"]),riskExpanded:z.boolean()}).strict();
export type OrderPreferences=z.infer<typeof orderPreferencesSchema>;
export const defaultOrderPreferences=():OrderPreferences=>({type:"limit",slippage:1,leverage:1,margin:"isolated",riskExpanded:false});
export const orderPreferencesKey=(owner:string,marketType:TradingPair["marketType"])=>`sinex:order-form:v1:${owner}:${marketType}`;
export interface OrderFormDraft {side:"buy"|"sell";type:OrderType;quantity:string;limit:string;stop:string;stopLoss:string;takeProfit:string;leverage:number;margin:"isolated"|"cross"}
/** Prepared for a separate derivatives executor; never sent to the spot API. */
export interface FuturesOrderRequest {marketType:"futures";exchange:TradingPair["exchange"];symbol:string;side:"long"|"short";type:"market"|"limit";quantity:string;limit?:number;leverage:number;margin:"isolated"|"cross";stopLoss?:number;takeProfit?:number;mutationId:string}
export const PAPER_CAPABILITIES={spot:{available:true,types:["market","limit","stop_market","stop_limit"] as readonly OrderType[],attachedRisk:false},futures:{available:false,types:["market","limit"] as readonly OrderType[],attachedRisk:false}} as const;
export function decimalMultiple(value:string|number,step:number){
  const parts=(value:string|number):[bigint,number]=>{const match=/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));if(!match)throw new Error("Invalid decimal");const decimals=(match[2]?.length??0)-Number(match[3]??0);if(Math.abs(decimals)>30)throw new Error("Decimal out of range");let atoms=BigInt(match[1]+(match[2]??""));if(decimals<0)atoms*=BigInt(10)**BigInt(-decimals);return [atoms,Math.max(0,decimals)];};
  try{const [a,ad]=parts(value),[b,bd]=parts(step),scale=Math.max(ad,bd);return b>BigInt(0)&&(a*BigInt(10)**BigInt(scale-ad))%(b*BigInt(10)**BigInt(scale-bd))===BigInt(0);}catch{return false;}
}
export function validateInstrumentOrder(pair:TradingPair,quantity:string,entry:number,limitPrice?:number){
  const q=Number(quantity),limits=pair.marketType==="futures"?pair.futuresInfo:pair.tradingLimits;
  if(!(pair.marketType==="spot"?/^\d+(?:\.\d{1,8})?$/:/^\d+(?:\.\d{1,18})?$/).test(quantity)||!Number.isFinite(q)||q<=0)return `Введите положительное количество, не более ${pair.marketType==="spot"?8:18} знаков после запятой.`;
  if(!Number.isFinite(entry)||entry<=0)return "Нет корректной цены заявки.";
  if(limits?.minQuantity&&q<limits.minQuantity)return `Минимальное количество — ${limits.minQuantity} ${pair.baseAsset}.`;
  if(limits?.maxQuantity&&q>limits.maxQuantity)return `Максимальное количество — ${limits.maxQuantity} ${pair.baseAsset}.`;
  if(limits?.quantityStep&&!decimalMultiple(quantity,limits.quantityStep))return `Шаг количества — ${limits.quantityStep} ${pair.baseAsset}.`;
  if(limitPrice!==undefined&&pair.priceIncrement&&!decimalMultiple(limitPrice,pair.priceIncrement))return `Шаг цены — ${pair.priceIncrement} ${pair.quoteAsset}.`;
  const notional=q*entry;if(!Number.isFinite(notional))return "Сумма заявки слишком велика.";
  if(limits?.minNotional&&notional<limits.minNotional)return `Минимальная сумма — ${limits.minNotional} ${pair.quoteAsset}.`;
  if(limits?.maxNotional&&notional>limits.maxNotional)return `Максимальная сумма — ${limits.maxNotional} ${pair.quoteAsset}.`;
  return "";
}
export function orderDraftCalculations(pair:TradingPair,draft:OrderFormDraft,reference:number|undefined){
  const entry=draft.type==="stop_market"?Number(draft.stop):draft.type==="market"?reference:Number(draft.limit),quantity=Number(draft.quantity),valid=Number.isFinite(entry)&&Number(entry)>0&&Number.isFinite(quantity)&&quantity>0;
  const direction=draft.side==="buy"?1:-1,stop=Number(draft.stopLoss),take=Number(draft.takeProfit);
  const notional=valid?quantity*entry!:undefined;
  const risk=valid&&draft.stopLoss&&stop>0?direction*(entry!-stop)*quantity:undefined;
  const reward=valid&&draft.takeProfit&&take>0?direction*(take-entry!)*quantity:undefined;
  return {entry,quantity,notional,contracts:valid&&pair.marketType==="futures"&&pair.futuresInfo?.contractSize?quantity/pair.futuresInfo.contractSize:undefined,initialMargin:notional!==undefined&&draft.leverage>=1?notional/draft.leverage:undefined,risk,reward,ratio:risk!==undefined&&risk>0&&reward!==undefined&&reward>0?reward/risk:undefined,entryFee:pair.marketType==="spot"&&notional!==undefined?notional*.001:undefined};
}
export function validateOrderDraft(pair:TradingPair,draft:OrderFormDraft,reference:number|undefined){
  const estimate=orderDraftCalculations(pair,draft,reference),basic=validateInstrumentOrder(pair,draft.quantity,Number(estimate.entry),draft.type.endsWith("limit")?Number(draft.limit):undefined);if(basic)return basic;
  if(draft.type.startsWith("stop")&&(!Number.isFinite(Number(draft.stop))||Number(draft.stop)<=0))return "Введите корректную стоп-цену активации.";
  if(pair.marketType==="futures"){
    if(!Number.isFinite(draft.leverage)||draft.leverage<1)return "Плечо должно быть не меньше 1×.";
    if(pair.futuresInfo?.maxLeverage&&draft.leverage>pair.futuresInfo.maxLeverage)return `Максимальное плечо — ${pair.futuresInfo.maxLeverage}×.`;
  }
  if(draft.stopLoss&&(estimate.risk===undefined||estimate.risk<=0))return "Стоп-лосс должен быть ниже входа для покупки и выше входа для продажи.";
  if(draft.takeProfit&&(estimate.reward===undefined||estimate.reward<=0))return "Тейк-профит должен быть выше входа для покупки и ниже входа для продажи.";
  return "";
}
