import type {ExchangeId,FuturesContractInfo} from "./types";
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
  const settlement=row.settleCoin??row.settleCcy??row.settleCurrency??row.marginAsset;
  if(typeof settlement==="string"&&settlement)info.settlementAsset=settlement;
  const explicitSize=positive(row.ctVal??row.quanto_multiplier??row.contractSize??row.contract_size??row.multiplier??details.contract_size);
  if(explicitSize){info.contractSize=explicitSize;info.contractSizeUnit=String(row.ctValCcy??row.baseCurrency??row.baseCoin??row.base_ccy??row.base??row.symbol??details.contract_root_unit??"");if(exchange==="coinbase")info.contractSizeUnit=String(details.contract_root_unit??"");if(exchange==="gate")info.contractSizeUnit=String(row.name??"").split("_")[0];if(info.contractSizeUnit==="XBT")info.contractSizeUnit="BTC";}
  const maximum=positive(exchange==="binance"?lot.maxQty:exchange==="bybit"?qty.maxOrderQty:exchange==="gate"?Number(row.order_size_max)*size:exchange==="kucoin"?Number(row.maxOrderQty)*size:exchange==="mexc"?Number(row.maxVol)*size:exchange==="coinbase"?Number(row.base_max_size)*size:undefined);
  if(maximum)info.maxQuantity=maximum;
  const notional=positive(exchange==="bitget"?row.minTradeUSDT:exchange==="whitebit"?row.minTotal:exchange==="kucoin"?row.minFunds:undefined);
  if(notional)info.minNotional=notional;
  return info;
}
