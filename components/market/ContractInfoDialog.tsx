"use client";
import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import type {TradingPair} from "@/lib/market/types";
const number=(value:number|undefined,unit="")=>value===undefined?"Нет данных":`${value.toLocaleString("ru-RU",{maximumFractionDigits:12})}${unit?` ${unit}`:""}`;
export function ContractInfoDialog({pair,close}:{pair:TradingPair;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const info=pair.futuresInfo,limits=pair.marketType==="futures"?info:pair.tradingLimits;
  const title=pair.marketType==="futures"?"Информация о контракте":"Информация об инструменте";
  const metric=(label:string,value:string)=><div><dt>{label}</dt><dd>{value}</dd></div>;
  return createPortal(<dialog ref={dialog} className="account-dialog contract-info-dialog" aria-labelledby="contract-info-title" onCancel={close} onClick={event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}>
    <header className="futures-parameters-heading"><div><h2 id="contract-info-title">{title}</h2><p>{pair.baseAsset}/{pair.quoteAsset} · {EXCHANGES[pair.exchange].name}</p></div><button type="button" onClick={close} aria-label="Закрыть информацию о контракте"><X size={18}/></button></header>
    <dl className="futures-contract-metrics">
      {metric("Биржа",EXCHANGES[pair.exchange].name)}{metric("Инструмент",pair.symbol)}
      {metric("Тип рынка",pair.marketType==="spot"?"Spot":info?.kind==="delivery"?"Delivery":info?.kind==="perpetual-style"?"Perpetual-style":info?.kind==="perpetual"?"Perpetual":"Нет данных")}
      {metric("Базовая валюта",pair.baseAsset)}{metric("Валюта котировки",pair.quoteAsset)}
      {pair.marketType==="futures"&&<>{metric("Валюта расчётов",info?.settlementAsset??"Нет данных")}{metric("Дата экспирации",info?.expiryAt?new Date(info.expiryAt).toLocaleString("ru-RU"):info?.kind==="perpetual"?"Без экспирации":"Нет данных")}{metric("Размер контракта",number(info?.contractSize,info?.contractSizeUnit))}{metric("Максимальное плечо",number(info?.maxLeverage,"×"))}{metric("Период funding",number(info?.fundingIntervalHours,"ч"))}</>}
      {metric("Минимальное количество",number(limits?.minQuantity,pair.baseAsset))}{metric("Максимальное количество",number(limits?.maxQuantity,pair.baseAsset))}
      {metric("Шаг количества",number(limits?.quantityStep,pair.baseAsset))}{metric("Шаг цены (tick size)",number(pair.priceIncrement,pair.quoteAsset))}
      {metric("Минимальная сумма",number(limits?.minNotional,pair.quoteAsset))}{metric("Максимальная сумма",number(limits?.maxNotional,pair.quoteAsset))}
    </dl>
    <div className="futures-parameters-actions"><button type="button" className="button" onClick={close}>Закрыть</button></div>
  </dialog>,document.body);
}
