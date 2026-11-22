import {z} from "zod";
import type {ExchangeId,FuturesContractInfo,TradingPair} from "./types";
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const positive=(value:unknown)=>value!==""&&value!=null&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):undefined;
/** Contract constraints come from public instrument metadata, never from display precision. */
export function futuresContractInfo(exchange:ExchangeId,row:Record<string,unknown>,size=1):FuturesContractInfo{
  const info:FuturesContractInfo={kind:exchange==="coinbase"?"perpetual-style":"perpetual"};
  const lot=Array.isArray(row.filters)?object(row.filters.find(value=>object(value).filterType==="LOT_SIZE")):{};
  const qty=object(row.lotSizeFilter),details=object(row.future_product_details);
  const max=positive(exchange==="bybit"?object(row.leverageFilter).maxLeverage:row.maxLever??row.maxLeverage??row.max_leverage??row.leverage_max);
  if(max)info.maxLeverage=max;
  const expiry=exchange==="coinbase"?Date.parse(String(details.contract_expiry)):undefined;
  if(expiry&&Number.isFinite(expiry))info.expiryAt=expiry;
  const interval=exchange==="bybit"?Number(row.fundingInterval)/60:exchange==="bitget"?Number(row.fundInterval):exchange==="gate"?Number(row.funding_interval)/3600:exchange==="kucoin"?Number(row.fundingRateGranularity)/3600000:exchange==="htx"?Number(row.settlement_period):exchange==="coinbase"?Number(String(details.funding_interval??"").replace(/s$/,""))/3600:undefined;
  if(interval&&Number.isFinite(interval)&&interval>0)info.fundingIntervalHours=interval;
  const minimum=positive(exchange==="binance"?lot.minQty:exchange==="bybit"?qty.minOrderQty:exchange==="bitget"?row.minTradeNum:exchange==="gate"?Number(row.order_size_min)*size:exchange==="kucoin"?Number(row.lotSize)*size:exchange==="mexc"?Number(row.minVol)*size:exchange==="whitebit"?row.minAmount:exchange==="coinbase"?Number(row.base_min_size)*size:exchange==="bingx"?row.tradeMinQuantity:undefined);
  const step=positive(exchange==="binance"?lot.stepSize:exchange==="bybit"?qty.qtyStep:exchange==="bitget"?row.sizeMultiplier:exchange==="kucoin"?Number(row.lotSize)*size:exchange==="mexc"?Number(row.volUnit)*size:exchange==="whitebit"?row.stepSize:exchange==="cryptocom"?row.qty_tick_size:exchange==="coinbase"?Number(row.base_increment)*size:undefined);
  if(minimum)info.minQuantity=minimum;if(step)info.quantityStep=step;
  return info;
}

const optionalAmount=z.string().max(40).refine(value=>value===""||Number.isFinite(Number(value))&&Number(value)>0,"Введите положительное число.");
export const futuresPositionSchema=z.object({direction:z.enum(["long","short"]),margin:z.enum(["isolated","cross"]),leverage:z.number().finite().min(1).max(1000),quantity:optionalAmount,stopLoss:optionalAmount,takeProfit:optionalAmount}).strict();
export type FuturesPositionSettings=z.infer<typeof futuresPositionSchema>;
export const defaultFuturesPosition=():FuturesPositionSettings=>({direction:"long",margin:"isolated",leverage:1,quantity:"",stopLoss:"",takeProfit:""});
export const futuresPositionKey=(owner:string,pair:TradingPair)=>`sinex:futures-position:v1:${owner}:${pair.exchange}:${pair.symbol}`;
export function validateFuturesPosition(settings:unknown,pair:TradingPair){
  const parsed=futuresPositionSchema.safeParse(settings);
  if(!parsed.success)return "Проверьте числовые параметры позиции.";
  const value=parsed.data,limits=pair.futuresInfo;
  if(limits?.maxLeverage&&value.leverage>limits.maxLeverage)return `Максимальное плечо по данным биржи — ${limits.maxLeverage}×.`;
  if(value.quantity){const quantity=Number(value.quantity);if(limits?.minQuantity&&quantity<limits.minQuantity)return `Минимальное количество — ${limits.minQuantity} ${pair.baseAsset}.`;if(limits?.quantityStep){const count=quantity/limits.quantityStep;if(Math.abs(count-Math.round(count))>1e-7*Math.max(1,Math.abs(count)))return `Шаг количества — ${limits.quantityStep} ${pair.baseAsset}.`;}}
  return "";
}
