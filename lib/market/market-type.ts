import {TIMEFRAMES,type ExchangeId,type MarketType,type Timeframe} from "./types";
import {exchangeTimeframes,intervalSpec,intervalSeconds} from "./intervals";
import {EXCHANGE_IDS} from "./exchange-config";

export const FUTURES_EXCHANGES:readonly ExchangeId[]=EXCHANGE_IDS;
export const supportsFutures=(exchange:ExchangeId)=>FUTURES_EXCHANGES.includes(exchange);
export const hasFuturesCandleStream=(exchange:ExchangeId)=>exchange!=="kraken"&&exchange!=="coinbase";
const map=(values:Partial<Record<Timeframe,string>>)=>values;
export const FUTURES_INTERVALS:Partial<Record<ExchangeId,Partial<Record<Timeframe,string>>>>={
  binance:map({"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","6h":"6h","8h":"8h","12h":"12h","1d":"1d","3d":"3d","1w":"1w","1M":"1M"}),
  bitget:map({"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","4h":"4H","6h":"6Hutc","12h":"12Hutc","1d":"1Dutc","3d":"3Dutc","1w":"1Wutc","1M":"1Mutc"}),
  kraken:map({"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","4h":"4h","12h":"12h","1d":"1d","1w":"1w"}),
  coinbase:map({"1m":"ONE_MINUTE","5m":"FIVE_MINUTE","15m":"FIFTEEN_MINUTE","30m":"THIRTY_MINUTE","1h":"ONE_HOUR","2h":"TWO_HOUR","4h":"FOUR_HOUR","6h":"SIX_HOUR","1d":"ONE_DAY"}),
  kucoin:map({"1m":"1","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","8h":"480","12h":"720","1d":"1440","1w":"10080"}),
  mexc:map({"1m":"Min1","5m":"Min5","15m":"Min15","30m":"Min30","1h":"Min60","4h":"Hour4","8h":"Hour8","1d":"Day1","1w":"Week1","1M":"Month1"}),
  bingx:map({"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","6h":"6h","12h":"12h","1d":"1d","3d":"3d","1w":"1w","1M":"1M"}),
};
export const marketTimeframes=(exchange:ExchangeId,marketType:MarketType)=>marketType==="futures"&&FUTURES_INTERVALS[exchange]?TIMEFRAMES.filter(tf=>!!FUTURES_INTERVALS[exchange]![tf]):exchangeTimeframes(exchange);
export function marketIntervalSpec(exchange:ExchangeId,marketType:MarketType,timeframe:Timeframe):{rest:string;ws?:string;computed?:boolean}{
  if(marketType==="futures"&&FUTURES_INTERVALS[exchange]){const rest=FUTURES_INTERVALS[exchange]![timeframe];if(!rest)throw new Error("Unsupported futures interval");return {rest};}
  return intervalSpec(exchange,timeframe);
}
export function marketTimeframe(exchange:ExchangeId,marketType:MarketType,timeframe:Timeframe):Timeframe{
  const supported=marketTimeframes(exchange,marketType),seconds=intervalSeconds(timeframe);
  return supported.reduce((best,candidate)=>Math.abs(intervalSeconds(candidate)-seconds)<Math.abs(intervalSeconds(best)-seconds)?candidate:best);
}
