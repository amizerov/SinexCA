"use client";
import { useEffect,useState,useRef,useMemo } from "react";
import { defaultIndicators,type IndicatorSettings } from "@/lib/indicators/settings";
import {scopedIndicatorDocumentSchema,resolveIndicators,indicatorScopeKey,applyIndicatorEdit,type IndicatorScope,type IndicatorScopeMap,type IndicatorForAll} from "@/lib/indicators/scope";
import {useWorkspacePreferences} from "./use-workspace-preferences";
interface State {ownerId:string;revision:number;settings:IndicatorSettings;overrides:IndicatorScopeMap;ready:boolean;busy:boolean;error:string}
export function useIndicatorPreferences(ownerId?:string,scope?:IndicatorScope){
  const workspace=useWorkspacePreferences(),managed=!!workspace.settings.layoutIndicators;
  const [state,setState]=useState<State>();
  const saving=useRef(false);
  useEffect(()=>{
    if(!ownerId||managed)return;const controller=new AbortController();let fetching=false,rerun=false;let retry:ReturnType<typeof setTimeout>|undefined;
    async function load(){if(controller.signal.aborted)return;if(fetching){rerun=true;return;}if(saving.current){clearTimeout(retry);retry=setTimeout(()=>void load(),250);return;}fetching=true;try{
      const response=await fetch("/api/indicators",{cache:"no-store",signal:controller.signal}),json=await response.json();if(!response.ok||json.ownerId!==ownerId)throw new Error(json.error?.message||"Не удалось загрузить настройки.");const data=scopedIndicatorDocumentSchema.parse(json.data);
      if(!controller.signal.aborted&&!saving.current)setState(old=>old&&old.ownerId===ownerId&&old.revision>data.revision?old:{ownerId:ownerId!,...data,ready:true,busy:false,error:""});
    }catch(error){if(!controller.signal.aborted)setState(old=>old&&old.ownerId===ownerId&&old.ready?old:{ownerId:ownerId!,revision:0,settings:defaultIndicators(),overrides:{},ready:false,busy:false,error:error instanceof Error?error.message:"Нет связи с базой."});}finally{fetching=false;if(rerun){rerun=false;void load();}}}
    const refresh=()=>{if(!document.hidden)void load();},storage=(event:StorageEvent)=>{if(event.key==="sinex:indicators")refresh();};
    void load();window.addEventListener("focus",refresh);window.addEventListener("storage",storage);document.addEventListener("visibilitychange",refresh);
    return()=>{controller.abort();clearTimeout(retry);window.removeEventListener("focus",refresh);window.removeEventListener("storage",storage);document.removeEventListener("visibilitychange",refresh);};
  },[ownerId,managed]);
  const current=managed?{ownerId:ownerId||"",...workspace.settings.layoutIndicators!,ready:workspace.ready,busy:false,error:workspace.error}:state?.ownerId===ownerId?state:undefined;
  const scopeKey=scope?indicatorScopeKey(scope):null;
  const stableScope=useMemo(()=>{if(!scopeKey)return undefined;const [exchange,marketType,symbol]=JSON.parse(scopeKey);return {exchange,marketType,symbol} as IndicatorScope;},[scopeKey]);
  const resolved=useMemo(()=>resolveIndicators(current?.settings||defaultIndicators(),current?.overrides||{},stableScope),[current?.settings,current?.overrides,stableScope]);
  async function save(settings:IndicatorSettings,forAll:IndicatorForAll=resolved.forAll){
    if(!ownerId||!current?.ready||current.busy||saving.current)return false;
    if(managed){const next=scope?applyIndicatorEdit(current.settings,current.overrides,scope,settings,forAll):{settings,overrides:current.overrides};workspace.update({layoutIndicators:{...next,revision:current.revision+1}});return true;}
    saving.current=true;
    setState({...current,busy:true,error:""});
    try{const response=await fetch("/api/indicators",{method:"PUT",headers:{"Content-Type":"application/json","X-Workspace-Id":ownerId},body:JSON.stringify({revision:current.revision,settings,mutationId:crypto.randomUUID(),...scope?{scope,forAll}:{}}),signal:AbortSignal.timeout(12000)}),json=await response.json();if(!response.ok)throw new Error(json.error?.message||"Не удалось сохранить настройки.");setState({ownerId,...scopedIndicatorDocumentSchema.parse(json.data),ready:true,busy:false,error:""});try{localStorage.setItem("sinex:indicators",crypto.randomUUID());}catch{/* Focus refresh still works when storage is disabled. */}return true;}
    catch(error){setState({...current,busy:false,error:error instanceof Error?error.message:"Нет связи с базой."});return false;}finally{saving.current=false;}
  }
  return {settings:resolved.settings,forAll:resolved.forAll,scope,revision:current?.revision||0,ready:!!current?.ready,busy:!!current?.busy,error:current?.error||"",document:current?{settings:current.settings,overrides:current.overrides,revision:current.revision}:undefined,save};
}
