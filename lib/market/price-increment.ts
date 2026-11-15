import type {ExchangeId} from "./types";
/** Read public instrument metadata only. Never infer the exchange tick from chart display precision. */
export function priceIncrement(exchange:ExchangeId,row:Record<string,unknown>):{priceIncrement?:number}{
  const decimals=(value:unknown)=>value!==null&&value!==undefined&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=18?10**-Number(value):undefined;
  const filters=Array.isArray(row.filters)?row.filters:[];
  const filter=filters.find(f=>f?.filterType==="PRICE_FILTER");
  const value=exchange==="binance"?filter?.tickSize:exchange==="mexc"?filter?.tickSize??decimals(row.quotePrecision):
    exchange==="bybit"?(row.priceFilter as Record<string,unknown>|undefined)?.tickSize:
    exchange==="okx"?row.tickSz:exchange==="coinbase"?row.quote_increment:
    exchange==="kucoin"?row.priceIncrement:exchange==="cryptocom"?row.price_tick_size:
    exchange==="kraken"?row.tick_size??decimals(row.pair_decimals):
    exchange==="gate"?decimals(row.precision):exchange==="bitget"?decimals(row.pricePrecision):
    exchange==="htx"?decimals(row["price-precision"]):exchange==="whitebit"?decimals(row.moneyPrec):
    exchange==="bingx"?row.tickSize??decimals(row.tickSizePrecision):undefined;
  const tick=Number(value);
  return Number.isFinite(tick)&&tick>0?{priceIncrement:tick}:{};
}
