import type {Ticker,TradingPair} from "./types";
export interface UsdtVolume {value:number|null;estimated:boolean;hint:string}
const nonnegative=(value:number|null|undefined):value is number=>value!=null&&Number.isFinite(value)&&value>=0;
export function usdtVolume(pair:Pick<TradingPair,"baseAsset"|"quoteAsset">|undefined,ticker:Ticker|undefined,lastPrice:number|undefined,usdtUsdRate:number|undefined):UsdtVolume{
  const missing=(hint:string):UsdtVolume=>({value:null,estimated:false,hint});
  if(!pair||!ticker)return missing("Ожидание данных об объёме");
  if(pair.quoteAsset==="USDT"&&nonnegative(ticker.quoteVolume24h))return {value:ticker.quoteVolume24h,estimated:false,hint:"Оборот за 24 часа в USDT по данным биржи"};
  if(pair.baseAsset==="USDT"&&nonnegative(ticker.baseVolume24h))return {value:ticker.baseVolume24h,estimated:false,hint:"Объём торгов USDT за 24 часа по данным биржи"};
  if(pair.quoteAsset!=="USDT"&&pair.quoteAsset!=="USD")return missing("Курс пересчёта этой валюты в USDT недоступен");
  const rate=pair.quoteAsset==="USDT"?1:usdtUsdRate;
  if(rate==null||!Number.isFinite(rate)||rate<=0)return missing("Ожидание курса USDT/USD для пересчёта объёма в USDT");
  const quoteVolume=nonnegative(ticker.quoteVolume24h)?ticker.quoteVolume24h:undefined;
  const referencePrice=lastPrice??ticker.lastPrice;
  if(quoteVolume!=null)return {value:quoteVolume/rate,estimated:true,hint:"Оборот в USD пересчитан в USDT по текущему курсу USDT/USD"};
  if(!nonnegative(ticker.baseVolume24h)||!Number.isFinite(referencePrice)||referencePrice<=0)return missing("Биржа не предоставила объём для пересчёта");
  const value=ticker.baseVolume24h*referencePrice/rate;
  if(!Number.isFinite(value))return missing("Не удалось рассчитать объём");
  return {value,estimated:true,hint:`Оценка: объём за 24 часа в ${pair.baseAsset} × последняя цена${pair.quoteAsset==="USD"?" ÷ текущий курс USDT/USD":""}. Цены сделок в течение суток различались.`};
}
