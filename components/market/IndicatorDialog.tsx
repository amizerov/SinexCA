"use client";
import { useEffect,useRef,useState } from "react";
import { X,Trash2,ChevronDown } from "lucide-react";
import {VWAP_DESCRIPTION} from "@/lib/indicators/vwap";
import {PROFILE_METHOD} from "@/lib/indicators/volume-profile";
import { defaultIndicators,indicatorSettingsSchema,newEma,MAX_EMA_LINES,type IndicatorSettings } from "@/lib/indicators/settings";
import type { useIndicatorPreferences } from "@/hooks/use-indicator-preferences";
import {type IndicatorKey} from "@/lib/indicators/scope";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {IndicatorCatalog} from "./IndicatorCatalog";
import {useFloatingNotice} from "@/components/FloatingNotices";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {defaultHeatmap,heatmapSettingsSchema} from "@/lib/market/heatmap/settings";
export function IndicatorDialog({preferences,close}:{preferences:ReturnType<typeof useIndicatorPreferences>;close:()=>void}){
  const workspace=useWorkspacePreferences();
  const [heatmap,setHeatmap]=useState(workspace.settings.heatmap);
  const dialog=useRef<HTMLDialogElement>(null),[draft,setDraft]=useState<IndicatorSettings>(preferences.settings),[error,setError]=useState("");
  const initialRevision=useRef(preferences.revision);
  const [forAll,setForAll]=useState(preferences.forAll);
  const [tab,setTab]=useState<"settings"|"catalog">("settings");
  const [section,setSection]=useState<"price"|"profile"|"pane"|"liquidity"|null>("price");
  function sectionHeader(key:"price"|"profile"|"pane"|"liquidity",title:string){return <legend><button type="button" className="indicator-section-toggle" aria-expanded={section===key} aria-controls={`indicator-section-${key}`} onClick={()=>setSection(old=>old===key?null:key)}>{title}<ChevronDown size={15}/></button></legend>;}
  const scopeLabel=preferences.scope?`${preferences.scope.symbol} · ${EXCHANGES[preferences.scope.exchange].name}`:"текущая пара";
  useFloatingNotice("indicator-settings",error||preferences.error,{actionLabel:!preferences.ready?"Повторить загрузку":undefined,action:!preferences.ready?()=>location.reload():undefined});
  function scopeToggle(key:IndicatorKey,label:string){return <label className="indicator-scope" title={`Включено — общая настройка для всех монет и бирж. Выключено — только ${scopeLabel}.`}><input type="checkbox" aria-label={`${label}: для всех`} checked={forAll[key]} disabled={preferences.busy||!preferences.ready||!preferences.scope} onChange={event=>setForAll(old=>({...old,[key]:event.target.checked}))}/><span>Для всех</span></label>;}
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  function addEma(){if(draft.ema.length>=MAX_EMA_LINES)return;setForAll(old=>({...old,[`ema${draft.ema.length}`]:true}));setDraft(old=>({...old,ema:[...old.ema,newEma(old.ema.length)]}));}
  function removeEma(index:number){
    setDraft(old=>({...old,ema:old.ema.filter((_,i)=>i!==index)}));
    setForAll(old=>{const next={...old};for(let i=index;i<draft.ema.length;i++)next[`ema${i}`]=old[`ema${i+1}`]??true;if(draft.ema.length>3)delete next[`ema${draft.ema.length-1}`];return next;});
  }
  function average(kind:"ema"|"sma",index:number=0){const config=kind==="ema"?draft.ema[index]:draft.sma,label=kind==="ema"?`EMA ${index+1}`:"SMA";
    function update(patch:Partial<typeof config>){setDraft(old=>kind==="sma"?{...old,sma:{...old.sma,...patch}}:{...old,ema:old.ema.map((line,i)=>i===index?{...line,...patch}:line) as IndicatorSettings["ema"]});}
    return <div className="indicator-row" key={label}><label className="indicator-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>update({enabled:e.target.checked})}/><span>{label}</span></label><label>Период<input aria-label={`Период ${label}`} type="number" min={2} max={200} required value={config.period} onChange={e=>update({period:Number(e.target.value)})}/></label><label>Цвет<input aria-label={`Цвет ${label}`} type="color" value={config.color} onChange={e=>update({color:e.target.value})}/></label>{scopeToggle(kind==="ema"?`ema${index}` as IndicatorKey:"sma",label)}{kind==="ema"&&<button type="button" className="icon-button" aria-label={`Удалить ${label}`} onClick={()=>removeEma(index)}><Trash2 size={14}/></button>}</div>;
  }
  return <dialog ref={dialog} className="account-dialog indicator-dialog" onCancel={close} aria-labelledby="indicators-title">
    <button className="account-close" onClick={close} aria-label="Закрыть индикаторы"><X size={18}/></button><h2 id="indicators-title">Индикаторы</h2>
    <div className="indicator-tabs" role="tablist" aria-label="Разделы индикаторов" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?"settings":event.key==="End"?"catalog":tab==="settings"?"catalog":"settings";setTab(next);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();}}>
      <button type="button" id="indicator-settings-tab" data-tab="settings" role="tab" aria-selected={tab==="settings"} aria-controls="indicator-settings-panel" tabIndex={tab==="settings"?0:-1} onClick={()=>setTab("settings")}>Настройки</button>
      <button type="button" id="indicator-catalog-tab" data-tab="catalog" role="tab" aria-selected={tab==="catalog"} aria-controls="indicator-catalog-panel" tabIndex={tab==="catalog"?0:-1} onClick={()=>setTab("catalog")}>Каталог</button>
    </div>
    <div className="indicator-settings-panel" id="indicator-settings-panel" role="tabpanel" aria-labelledby="indicator-settings-tab" hidden={tab!=="settings"}>
    <form onSubmit={async event=>{event.preventDefault();if(initialRevision.current!==preferences.revision){setError("Настройки изменились в другой вкладке. Переоткройте окно индикаторов, чтобы загрузить их.");return;}const parsed=indicatorSettingsSchema.safeParse(draft);if(!parsed.success){const key=parsed.error.issues[0]?.path[0];setSection(key==="profile"?"profile":key==="rsi"?"pane":"price");setError("Проверьте параметры индикаторов и допустимые значения полей.");return;}setError("");const parsedHeatmap=heatmapSettingsSchema.safeParse(heatmap);if(!parsedHeatmap.success){setSection("liquidity");setError("Проверьте параметры карты ликвидности.");return;}if(await preferences.save(parsed.data,forAll)){workspace.update({heatmap:parsedHeatmap.data});close();}}}>
      <div className="indicator-settings-scroll">
      <fieldset className="indicator-section" disabled={preferences.busy||!preferences.ready||section!=="price"}>{sectionHeader("price","Поверх цены")}<div className="indicator-section-body" id="indicator-section-price" hidden={section!=="price"}>{draft.ema.map((_,index)=>average("ema",index))}<button type="button" className="button" disabled={draft.ema.length>=MAX_EMA_LINES} onClick={addEma}>Добавить EMA</button>{average("sma")}
        <div className="indicator-row vwap-settings" title={VWAP_DESCRIPTION}>
          <label className="indicator-toggle"><input aria-label="Показывать VWAP" type="checkbox" checked={draft.vwap.enabled} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,enabled:event.target.checked}})}/><span>VWAP</span></label>
          <label>Цвет<input aria-label="Цвет VWAP" type="color" value={draft.vwap.color} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,color:event.target.value}})}/></label>
          <label>Толщина<select aria-label="Толщина VWAP" value={draft.vwap.width} onChange={event=>setDraft({...draft,vwap:{...draft.vwap,width:Number(event.target.value) as 1|2|3|4}})}>{[1,2,3,4].map(width=><option key={width} value={width}>{width} px</option>)}</select></label>
          {scopeToggle("vwap","VWAP")}
          <button type="button" className="icon-button" aria-label="Удалить VWAP" onClick={()=>setDraft({...draft,vwap:defaultIndicators().vwap})}><Trash2 size={14}/></button>
        </div>
      </div></fieldset>
      <fieldset className="profile-settings indicator-section" title={PROFILE_METHOD} disabled={preferences.busy||!preferences.ready||section!=="profile"}>{sectionHeader("profile","Профиль объёма")}<div className="indicator-section-body" id="indicator-section-profile" hidden={section!=="profile"}>
        <div className="indicator-volume-row"><label className="indicator-toggle"><input aria-label="Профиль объёма" type="checkbox" checked={draft.profile.enabled} onChange={e=>setDraft({...draft,profile:{...draft.profile,enabled:e.target.checked}})}/><span>Профиль объёма</span></label>{scopeToggle("profile","Профиль объёма")}</div>
        {draft.profile.enabled&&<div className="profile-settings-grid">
          <label>Период<select aria-label="Период профиля" value={draft.profile.period} onChange={e=>setDraft({...draft,profile:{...draft.profile,period:e.target.value as "visible"|"day"}})}><option value="visible">Видимый диапазон</option><option value="day">Текущий день · UTC</option></select></label>
          <label>Положение<select aria-label="Положение профиля" value={draft.profile.side} onChange={e=>setDraft({...draft,profile:{...draft.profile,side:e.target.value as "left"|"right"}})}><option value="left">Слева</option><option value="right">Справа</option></select></label>
          <label>Ширина, %<input aria-label="Ширина профиля" type="number" min={5} max={30} required value={draft.profile.width} onChange={e=>setDraft({...draft,profile:{...draft.profile,width:Number(e.target.value)}})}/></label>
          <label>Уровней<input aria-label="Уровни профиля" type="number" min={5} max={200} required value={draft.profile.levels} onChange={e=>setDraft({...draft,profile:{...draft.profile,levels:Number(e.target.value)}})}/></label>
          <label>Цвет<input aria-label="Цвет профиля" type="color" value={draft.profile.color} onChange={e=>setDraft({...draft,profile:{...draft.profile,color:e.target.value}})}/></label>
          <label>Непрозрачность, %<input aria-label="Непрозрачность профиля" type="number" min={5} max={80} required value={draft.profile.opacity} onChange={e=>setDraft({...draft,profile:{...draft.profile,opacity:Number(e.target.value)}})}/></label>
          <label>Цвет POC<input aria-label="Цвет POC" type="color" value={draft.profile.pocColor} onChange={e=>setDraft({...draft,profile:{...draft.profile,pocColor:e.target.value}})}/></label>
          <label className="indicator-toggle"><input aria-label="Линия POC" type="checkbox" checked={draft.profile.poc} onChange={e=>setDraft({...draft,profile:{...draft.profile,poc:e.target.checked}})}/><span>Линия POC</span></label>
        </div>}
      </div></fieldset>
      <fieldset className="indicator-section" disabled={preferences.busy||!preferences.ready||section!=="pane"}>{sectionHeader("pane","Отдельная панель")}<div className="indicator-section-body" id="indicator-section-pane" hidden={section!=="pane"}><div className="indicator-row"><label className="indicator-toggle"><input type="checkbox" checked={draft.rsi.enabled} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,enabled:e.target.checked}})}/><span>RSI</span></label><label>Период<input aria-label="Период RSI" type="number" required min={2} max={200} value={draft.rsi.period} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,period:Number(e.target.value)}})}/></label><label>Цвет<input aria-label="Цвет RSI" type="color" value={draft.rsi.color} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,color:e.target.value}})}/></label>{scopeToggle("rsi","RSI")}</div><div className="rsi-levels"><label>Нижний уровень<input aria-label="Нижний уровень RSI" type="number" required min={0} max={49} value={draft.rsi.lower} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,lower:Number(e.target.value)}})}/></label><label>Верхний уровень<input aria-label="Верхний уровень RSI" type="number" required min={51} max={100} value={draft.rsi.upper} onChange={e=>setDraft({...draft,rsi:{...draft.rsi,upper:Number(e.target.value)}})}/></label></div></div></fieldset>
      <fieldset className="indicator-section" disabled={preferences.busy||!workspace.ready||section!=="liquidity"}>{sectionHeader("liquidity","Ликвидность · Heatmap")}<div className="indicator-section-body" id="indicator-section-liquidity" hidden={section!=="liquidity"}>
        <label className="indicator-toggle"><input aria-label="Тепловая карта ликвидности" type="checkbox" checked={heatmap.enabled} onChange={e=>setHeatmap({...heatmap,enabled:e.target.checked})}/><span>Показывать тепловую карту</span></label>
        <div className="profile-settings-grid">
          <label>Отображение<select aria-label="Источник ликвидности" value={heatmap.source} onChange={e=>setHeatmap({...heatmap,source:e.target.value as "zones"|"orderbook"})}><option value="zones">Зоны по экстремумам · расчёт</option><option value="orderbook">История заявок стакана</option></select></label>
          <label>Непрозрачность, %<input aria-label="Непрозрачность карты" type="number" min={10} max={80} required value={heatmap.opacity} onChange={e=>setHeatmap({...heatmap,opacity:Number(e.target.value)})}/></label>
          {heatmap.source==="orderbook"&&<><label>Палитра<select aria-label="Палитра карты" value={heatmap.palette} onChange={e=>setHeatmap({...heatmap,palette:e.target.value as "classic"|"green"})}><option value="classic">Classic</option><option value="green">Sinex Green</option></select></label>
          <label>Длительность присутствия<select aria-label="Длительность присутствия" value={heatmap.persistence} onChange={e=>setHeatmap({...heatmap,persistence:Number(e.target.value) as 0|5|30})}><option value="0">Все уровни</option><option value="5">От 5 секунд</option><option value="30">От 30 секунд</option></select></label></>}
        </div>
        <a className="account-hint" href="/help/charts#ликвидность--heatmap" target="_blank" rel="noreferrer">Справка по ликвидности ↗</a>
      </div></fieldset>
      <div className="indicator-volume-row"><label className="indicator-toggle"><input type="checkbox" checked={draft.volume} disabled={preferences.busy||!preferences.ready} onChange={e=>setDraft({...draft,volume:e.target.checked})}/><span>Показывать объём</span></label>{scopeToggle("volume","Объём")}</div>
      </div>
      <div className="indicator-dialog-actions"><button type="button" className="button" disabled={preferences.busy} onClick={()=>{setDraft(defaultIndicators());setHeatmap(defaultHeatmap());}}>Сбросить</button><button type="button" className="button" onClick={close}>Отмена</button><button type="submit" className="account-submit" disabled={!preferences.ready||preferences.busy||!workspace.ready}>{preferences.busy?"Сохранение…":"Применить"}</button></div>
    </form>
    </div>
    <div className="indicator-catalog-panel" id="indicator-catalog-panel" role="tabpanel" aria-labelledby="indicator-catalog-tab" hidden={tab!=="catalog"}><IndicatorCatalog openSettings={id=>{if(id==="liquidity-heatmap"){setHeatmap({...heatmap,enabled:true});setSection("liquidity");}else {if(id==="ema")addEma();setSection(id==="rsi"?"pane":"price");}setTab("settings");}} addProfile={()=>{setDraft({...draft,profile:{...draft.profile,enabled:true}});setSection("profile");setTab("settings");}} addVwap={()=>{setDraft({...draft,vwap:{...draft.vwap,enabled:true}});setSection("price");setTab("settings");}}/></div>
  </dialog>;
}
