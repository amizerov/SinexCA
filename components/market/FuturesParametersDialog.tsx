"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import type {TradingPair} from "@/lib/market/types";
import {defaultFuturesPosition,futuresPositionKey,futuresPositionSchema,validateFuturesPosition,type FuturesPositionSettings} from "@/lib/market/futures-settings";

const number=(value:number|undefined)=>value===undefined?"Не указан":value.toLocaleString("ru-RU",{maximumFractionDigits:12});
export function FuturesParametersDialog({pair,ownerId,close}:{pair:TradingPair;ownerId:string;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),key=futuresPositionKey(ownerId,pair);
  const [draft,setDraft]=useState<FuturesPositionSettings>(()=>{try{const parsed=futuresPositionSchema.safeParse(JSON.parse(localStorage.getItem(key)||"null"));if(parsed.success)return parsed.data;}catch{}return defaultFuturesPosition();});
  const [error,setError]=useState("");
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const info=pair.futuresInfo;
  const metric=(label:string,value:string)=><div><dt>{label}</dt><dd>{value}</dd></div>;
  function save(event:React.FormEvent){
    event.preventDefault();const problem=validateFuturesPosition(draft,pair);if(problem){setError(problem);return;}
    try{localStorage.setItem(key,JSON.stringify(futuresPositionSchema.parse(draft)));close();}catch{setError("Не удалось сохранить параметры в браузере.");}
  }
  return createPortal(<dialog ref={dialog} className="account-dialog futures-parameters-dialog" aria-labelledby="futures-parameters-title" onCancel={close} onClick={event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}>
    <header className="futures-parameters-heading"><div><h2 id="futures-parameters-title">Параметры фьючерса</h2><p>{pair.baseAsset}/{pair.quoteAsset} · {EXCHANGES[pair.exchange].name}</p></div><button type="button" onClick={close} aria-label="Закрыть параметры фьючерса"><X size={18}/></button></header>
    <dl className="futures-contract-metrics">
      {metric("Контракт",pair.symbol)}
      {metric("Срок",info?.kind==="perpetual-style"?"Perpetual-style":"Бессрочный · Perpetual")}
      {info?.expiryAt&&metric("Дата экспирации биржи",new Date(info.expiryAt).toLocaleString("ru-RU"))}
      {metric("Валюта цены",pair.quoteAsset)}
      {metric("Размер контракта",pair.contractSize===undefined?"Не указан":`${number(pair.contractSize)} ${pair.baseAsset}`)}
      {metric("Шаг цены",pair.priceIncrement===undefined?"Не указан":`${number(pair.priceIncrement)} ${pair.quoteAsset}`)}
      {metric("Минимальное количество",info?.minQuantity===undefined?"Не указано":`${number(info.minQuantity)} ${pair.baseAsset}`)}
      {metric("Максимальное плечо",info?.maxLeverage?`${number(info.maxLeverage)}×`:"Не указано")}
      {metric("Период funding",info?.fundingIntervalHours?`${number(info.fundingIntervalHours)} ч`:"Не указан")}
    </dl>
    <form onSubmit={save}>
      <h3>Параметры позиции</h3>
      <div className="futures-position-fields">
        <label>Направление<select aria-label="Направление" value={draft.direction} onChange={event=>setDraft({...draft,direction:event.target.value as FuturesPositionSettings["direction"]})}><option value="long">Лонг</option><option value="short">Шорт</option></select></label>
        <label>Режим маржи<select aria-label="Режим маржи" value={draft.margin} onChange={event=>setDraft({...draft,margin:event.target.value as FuturesPositionSettings["margin"]})}><option value="isolated">Изолированная</option><option value="cross">Кросс</option></select></label>
        <label>Плечо, ×<input type="number" min="1" max={info?.maxLeverage??1000} step="any" value={draft.leverage} onChange={event=>setDraft({...draft,leverage:Number(event.target.value)})}/></label>
        <label>Количество, {pair.baseAsset}<input type="number" min={info?.minQuantity??"0"} step="any" value={draft.quantity} placeholder="Не задано" onChange={event=>setDraft({...draft,quantity:event.target.value})}/></label>
        <label>Стоп-лосс, {pair.quoteAsset}<input type="number" min="0" step="any" value={draft.stopLoss} placeholder="Не задан" onChange={event=>setDraft({...draft,stopLoss:event.target.value})}/></label>
        <label>Тейк-профит, {pair.quoteAsset}<input type="number" min="0" step="any" value={draft.takeProfit} placeholder="Не задан" onChange={event=>setDraft({...draft,takeProfit:event.target.value})}/></label>
      </div>
      <p className="futures-parameters-note">Параметры сохраняются для этого контракта в браузере. Открытие фьючерсных позиций пока недоступно.</p>
      {error&&<p className="futures-parameters-error" role="alert">{error}</p>}
      <div className="futures-parameters-actions"><button type="button" className="button" onClick={close}>Отмена</button><button type="submit" className="account-submit">Сохранить</button></div>
    </form>
  </dialog>,document.body);
}
