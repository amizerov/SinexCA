import { TIMEFRAMES,type ExchangeId,type Timeframe } from "./types";
type Spec={rest:string;ws?:string;computed?:boolean};
type Intervals=Partial<Record<Timeframe,Spec>>;
const native=(values:Partial<Record<Timeframe,string>>):Intervals=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{rest:value,ws:value}]));
const binance=native(Object.fromEntries(["1s","1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"].map(key=>[key,key])));
export const EXCHANGE_INTERVALS:Record<ExchangeId,Intervals>={
  whitebit:Object.fromEntries(["1s","10s","30s","1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"].map(tf=>[tf,{rest:tf,ws:String(tf==="1M"?2592000:intervalSeconds(tf as Timeframe))}])),
  cryptocom:native({"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","12h":"12h","1d":"1D","1w":"7D","14d":"14D","1M":"1M"}),
  gemini:{"1m":{rest:"1m"},"5m":{rest:"5m"},"15m":{rest:"15m"},"30m":{rest:"30m"},"1h":{rest:"1h"},"6h":{rest:"6h"},"1d":{rest:"1d"}},
  binance,
  bybit:native({"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","6h":"360","12h":"720","1d":"D","1w":"W","1M":"M"}),
  okx:native({"1s":"1s","1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","6h":"6Hutc","12h":"12Hutc","1d":"1Dutc","2d":"2Dutc","3d":"3Dutc","1w":"1Wutc","1M":"1Mutc","3M":"3Mutc"}),
  bitget:{...native({"1m":"1min","3m":"3min","5m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","6h":"6Hutc","12h":"12Hutc","1d":"1Dutc","3d":"3Dutc","1w":"1Wutc","1M":"1Mutc"}),"1m":{rest:"1min",ws:"1m"},"3m":{rest:"3min"},"5m":{rest:"5min",ws:"5m"},"15m":{rest:"15min",ws:"15m"},"30m":{rest:"30min",ws:"30m"},"1h":{rest:"1h",ws:"1H"},"4h":{rest:"4h",ws:"4H"}},
  gate:native({"10s":"10s","1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","4h":"4h","8h":"8h","1d":"1d","1w":"7d","1M":"30d"}),
  kraken:native({"1m":"1","5m":"5","15m":"15","30m":"30","1h":"60","4h":"240","1d":"1440","1w":"10080","15d":"21600"}),
  coinbase:{"1m":{rest:"60"},"5m":{rest:"300"},"15m":{rest:"900"},"1h":{rest:"3600"},"4h":{rest:"3600",computed:true},"6h":{rest:"21600"},"1d":{rest:"86400"}},
  kucoin:native({"1m":"1min","3m":"3min","5m":"5min","15m":"15min","30m":"30min","1h":"1hour","2h":"2hour","4h":"4hour","6h":"6hour","8h":"8hour","12h":"12hour","1d":"1day","1w":"1week","1M":"1month"}),
  bitfinex:{...native({"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","3h":"3h","6h":"6h","12h":"12h","1d":"1D","1w":"1W","14d":"14D","1M":"1M"}),"4h":{rest:"1h",ws:"1h",computed:true}},
  htx:native({"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1h":"60min","4h":"4hour","1d":"1day","1w":"1week","1M":"1mon","1y":"1year"}),
  mexc:{"1m":{rest:"1m",ws:"Min1"},"5m":{rest:"5m",ws:"Min5"},"15m":{rest:"15m",ws:"Min15"},"30m":{rest:"30m",ws:"Min30"},"1h":{rest:"60m",ws:"Min60"},"4h":{rest:"4h",ws:"Hour4"},"1d":{rest:"1d",ws:"Day1"},"1w":{rest:"1W",ws:"Week1"},"1M":{rest:"1M",ws:"Month1"}},
};
export const exchangeTimeframes=(exchange:ExchangeId)=>TIMEFRAMES.filter(timeframe=>!!EXCHANGE_INTERVALS[exchange][timeframe]);
export function intervalSpec(exchange:ExchangeId,timeframe:Timeframe){const spec=EXCHANGE_INTERVALS[exchange][timeframe];if(!spec)throw new Error(`Unsupported interval ${exchange}:${timeframe}`);return spec;}
export const restInterval=(exchange:ExchangeId,timeframe:Timeframe)=>intervalSpec(exchange,timeframe).rest;
export const wsInterval=(exchange:ExchangeId,timeframe:Timeframe)=>intervalSpec(exchange,timeframe).ws;
export function intervalSeconds(timeframe:Timeframe){const n=parseInt(timeframe);return n*(timeframe.endsWith("s")?1:timeframe.endsWith("m")?60:timeframe.endsWith("h")?3600:timeframe.endsWith("d")?86400:timeframe.endsWith("w")?604800:timeframe.endsWith("M")?2678400:31622400);}
/** Keep exact intervals; otherwise use the closest duration, preferring the longer on a tie. */
export function nearestTimeframe(exchange:ExchangeId,requested:Timeframe):Timeframe {
  const supported=exchangeTimeframes(exchange);
  if(supported.includes(requested))return requested;
  const seconds=intervalSeconds(requested);
  return supported.reduce((best,candidate)=>{
    const distance=Math.abs(intervalSeconds(candidate)-seconds),bestDistance=Math.abs(intervalSeconds(best)-seconds);
    return distance<bestDistance||(distance===bestDistance&&intervalSeconds(candidate)>intervalSeconds(best))?candidate:best;
  });
}
export const INTERVAL_MINUTES=Object.fromEntries(TIMEFRAMES.map(tf=>[tf,intervalSeconds(tf)/60])) as Record<Timeframe,number>;
/** Calendar-aware bounds for backfilling months/years, not fixed 30-day approximations. */
export function shiftInterval(time:number,timeframe:Timeframe,count:number){const date=new Date(time*1000);if(timeframe.endsWith("M")||timeframe.endsWith("y")){const day=date.getUTCDate();date.setUTCDate(1);if(timeframe.endsWith("M"))date.setUTCMonth(date.getUTCMonth()+parseInt(timeframe)*count);else date.setUTCFullYear(date.getUTCFullYear()+parseInt(timeframe)*count);const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return Math.floor(date.getTime()/1000);}return time+intervalSeconds(timeframe)*count;}
