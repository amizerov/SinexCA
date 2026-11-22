import type {ExchangeId,TradingLimits} from "./types";
import {priceIncrement} from "./price-increment";
const object=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"?x as Record<string,unknown>:{};
const positive=(x:unknown)=>x!==""&&x!=null&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):undefined;
export function instrumentMetadata(exchange:ExchangeId,row:Record<string,unknown>){
  const limits:TradingLimits={},filters=Array.isArray(row.filters)?row.filters:[];
  const lot=object(filters.find(x=>object(x).filterType==="LOT_SIZE")),notional=object(filters.find(x=>["NOTIONAL","MIN_NOTIONAL"].includes(String(object(x).filterType))));
  const qty=object(row.lotSizeFilter);
  const values:TradingLimits={
    minQuantity:positive(lot.minQty??qty.minOrderQty??(exchange==="coinbase"?row.base_min_size:exchange==="kucoin"?row.baseMinSize:exchange==="gate"?row.min_base_amount:exchange==="kraken"?row.ordermin:exchange==="whitebit"?row.minAmount:exchange==="htx"?row["min-order-amt"]:undefined)),
    maxQuantity:positive(lot.maxQty??qty.maxOrderQty??(exchange==="coinbase"?row.base_max_size:exchange==="kucoin"?row.baseMaxSize:exchange==="gate"?row.max_base_amount:undefined)),
    quantityStep:positive(lot.stepSize??qty.qtyStep??(exchange==="coinbase"?row.base_increment:exchange==="kucoin"?row.baseIncrement:exchange==="whitebit"?row.stepSize:exchange==="cryptocom"?row.qty_tick_size:undefined)),
    minNotional:positive(notional.minNotional??(exchange==="kucoin"?row.minFunds:exchange==="kraken"?row.costmin:exchange==="whitebit"?row.minTotal:undefined)),
    maxNotional:positive(notional.maxNotional??(exchange==="whitebit"?row.maxTotal:undefined)),
  };
  for(const key of Object.keys(values) as (keyof TradingLimits)[])if(values[key]!==undefined)limits[key]=values[key];
  return {...priceIncrement(exchange,row),...Object.keys(limits).length?{tradingLimits:limits}:{}};
}
