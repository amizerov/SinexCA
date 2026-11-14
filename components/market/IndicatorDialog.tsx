"use client";
import { useEffect,useRef,useState } from "react";
import { X,Trash2 } from "lucide-react";
import {VWAP_DESCRIPTION} from "@/lib/indicators/vwap";
import { defaultIndicators,indicatorSettingsSchema,type IndicatorSettings } from "@/lib/indicators/settings";
import type { useIndicatorPreferences } from "@/hooks/use-indicator-preferences";
import {type IndicatorKey} from "@/lib/indicators/scope";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {IndicatorCatalog} from "./IndicatorCatalog";
import {useFloatingNotice} from "@/components/FloatingNotices";
export function IndicatorDialog({preferences,close}:{preferences:ReturnType<typeof useIndicatorPreferences>;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[draft,setDraft]=useState<IndicatorSettings>(preferences.settings),[error,setError]=useState("");
  const initialRevision=useRef(preferences.revision);
  const [forAll,setForAll]=useState(preferences.forAll);
  const [tab,setTab]=useState<"settings"|"catalog">("settings");
  const scopeLabel=preferences.scope?`${preferences.scope.symbol} · ${EXCHANGES[preferences.scope.exchange].name}`:"текущая пара";
  useFloatingNotice("indicator-settings",error||preferences.error,{actionLabel:!preferences.ready?"Повторить загрузку":undefined,action:!preferences.ready?()=>location.reload():undefined});
  function scopeToggle(key:IndicatorKey,label:string){return <label className="indicator-scope" title={`Включено — общая настройка для всех монет и бирж. Выключено — только ${scopeLabel}.`}><input type="checkbox" aria-label={`${label}: для всех`} checked={forAll[key]} disabled={preferences.busy||!preferences.ready||!preferences.scope} onChange={event=>setForAll(old=>({...old,[key]:event.target.checked}))}/><span>Для всех</span></label>;}
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  function average(kind:"ema"|"sma",index:number=0){const config=kind==="ema"?draft.ema[index]:draft.sma,label=kind==="ema"?`EMA ${index+1}`:"SMA";
    function update(patch:Partial<typeof config>){setDraft(old=>kind==="sma"?{...old,sma:{...old.sma,...patch}}:{...old,ema:old.ema.map((line,i)=>i===index?{...line,...patch}:line) as IndicatorSettings["ema"]});}
    return <div className="indicator-row" key={label}><label className="indicator-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>update({enabled:e.target.checked})}/><span>{label}</span></label><label>Период<input aria-label={`Период ${label}`} type="number" min={2} max={200} required value={config.period} onChange={e=>update({period:Number(e.target.value)})}/></label><label>Цвет<input aria-label={`Цвет ${label}`} type="color" value={config.color} onChange={e=>update({color:e.target.value})}/></label>{scopeToggle(kind==="ema"?`ema${index}` as IndicatorKey:"sma",label)}</div>;
  }
  return <dialog ref={dialog} className="account-dialog indicator-dialog" onCancel={close} aria-labelledby="indicators-title">
    <button className="account-close" onClick={close} aria-label="Закрыть индикаторы"><X size={18}/></button><h2 id="indicators-title">Индикаторы</h2>
    <div className="indicator-tabs" role="tablist" aria-label="Разделы индикаторов" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?"settings":event.key==="End"?"catalog":tab==="settings"?"catalog":"settings";setTab(next);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();}}>
      <button type="button" id="indicator-settings-tab" data-tab="settings" role="tab" aria-selected={tab==="settings"} aria-controls="indicator-settings-panel" tabIndex={tab==="settings"?0:-1} onClick={()=>setTab("settings")}>Настройки</button>
      <button type="button" id="indicator-catalog-tab" data-tab="catalog" role="tab" aria-selected={tab==="catalog"} aria-controls="indicator-catalog-panel" tabIndex={tab==="catalog"?0:-1} onClick={()=>setTab("catalog")}>Каталог</button>
    </div>
    <div className="indicator-settings-panel" id="indicator-settings-panel" role="tabpanel" aria-labelledby="indicator-settings-tab" hidden={tab!=="settings"}>
    <form onSubmit={async event=>{event.preventDefault();if(initialRevision.current!==preferences.revision){setError("Настройки изменились в другой вкладке. Переоткройте окно индикаторов, чтобы загрузить их.");return;}const parsed=indicatorSettingsSchema.safeParse(draft);if(!parsed.success){setError("Проверьте периоды (2–200) и уровни RSI.");return;}setError("");if(await preferences.save(parsed.data,forAll))close();}}>
      <fieldset disabled={preferences.busy||!preferences.ready}><legend>Поверх цены</legend>{[0,1,2].map(index=>average("ema",index))}{average("sma")}
        <div className="indicator-row vwap-settings" title={VWAP_DESCRIPTION}>
          <label className="indicator-toggle"><input aria-label="Показывать VWAP" type="checkbox" checked={draft.vwap.enabled} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,enabled:event.target.checked}})}/><span>VWAP</span></label>
          <label>Цвет<input aria-label="Цвет VWAP" type="color" value={draft.vwap.color} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,color:event.target.value}})}/></label>
          <label>Толщина<select aria-label="Толщина VWAP" value={draft.vwap.width} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,width:Number(event.target.value) as 1|2|3|4}})}>{[1,2,3,4].map(width=><option key={width} value={width}>{width} px</option>)}</select></label>
          {scopeToggle("vwap","VWAP")}
          <button type="button" className="icon-button" aria-label="Удалить VWAP" onClick={()=>setDraft({...draft,vwap:defaultIndicators().vwap})}><Trash2 size={14}/></button>
        </div>
      </fieldset>
      <fieldset disabled={preferences.busy||!preferences.ready}><legend>Отдельная панель</legend><div className="indicator-row"><label className="indicator-toggle"><input type="checkbox" checked={draft.rsi.enabled} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,enabled:e.target.checked}})}/><span>RSI</span></label><label>Период<input aria-label="Период RSI" type="number" required min={2} max={200} value={draft.rsi.period} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,period:Number(e.target.value)}})}/></label><label>Цвет<input aria-label="Цвет RSI" type="color" value={draft.rsi.color} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,color:e.target.value}})}/></label>{scopeToggle("rsi","RSI")}</div><div className="rsi-levels"><label>Нижний уровень<input aria-label="Нижний уровень RSI" type="number" required min={0} max={49} value={draft.rsi.lower} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,lower:Number(e.target.value)}})}/></label><label>Верхний уровень<input aria-label="Верхний уровень RSI" type="number" required min={51} max={100} value={draft.rsi.upper} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,upper:Number(e.target.value)}})}/></label></div></fieldset>
      <div className="indicator-volume-row"><label className="indicator-toggle"><input type="checkbox" checked={draft.volume} disabled={preferences.busy||!preferences.ready} onChange={e=>setDraft({...draft,volume:e.target.checked})}/><span>Показывать объём</span></label>{scopeToggle("volume","Объём")}</div>
      <div className="indicator-dialog-actions"><button type="button" className="button" disabled={preferences.busy} onClick={()=>setDraft(defaultIndicators())}>Сбросить</button><button type="button" className="button" onClick={close}>Отмена</button><button type="submit" className="account-submit" disabled={!preferences.ready||preferences.busy}>{preferences.busy?"Сохранение…":"Применить"}</button></div>
    </form>
    </div>
    <div className="indicator-catalog-panel" id="indicator-catalog-panel" role="tabpanel" aria-labelledby="indicator-catalog-tab" hidden={tab!=="catalog"}><IndicatorCatalog openSettings={()=>setTab("settings")} addVwap={()=>{setDraft({...draft,vwap:{...draft.vwap,enabled:true}});setTab("settings");}}/></div>
  </dialog>;
}
