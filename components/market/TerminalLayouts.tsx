"use client";
import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode,type FormEvent} from "react";
import {createPortal} from "react-dom";
import {Check,ChevronLeft,Grid2X2,Save,Copy,Settings2,Pencil,Trash2,X,Plus,LoaderCircle} from "lucide-react";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {workspaceSnapshot,updateWorkspace,saveWorkspaceNow} from "@/lib/ui/workspace-client";
import {captureLayout,applyLayout,layoutChanged,availableLayoutName,validateLayoutName,type LayoutLibrary} from "@/lib/ui/terminal-layouts";
import type {WorkspaceSettings} from "@/lib/ui/workspace-settings";
import {useFloatingNotice} from "@/components/FloatingNotices";

type Entry=LayoutLibrary["items"][number];
interface LayoutActions {
  name:string;dirty:boolean;busy:boolean;ready:boolean;activeId:string|null;items:Entry[];
  manage:()=>void;choose:(id:string|null,back?:boolean)=>void;save:()=>void;copy:(back?:boolean)=>void;
}
const Context=createContext<LayoutActions|null>(null);
type DialogState={type:"manage"}|{type:"name";id?:string;back:boolean}|{type:"delete";id:string}|{type:"switch";id:string|null;back:boolean};
function Modal({title,children,close,wide=false}:{title:string;children:ReactNode;close:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),id=useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();const input=dialog?.querySelector("input");if(input){input.focus();input.select();}return()=>dialog?.close();},[]);
  return createPortal(<dialog ref={ref} className={`layout-dialog ${wide?"layout-manager":""}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();close();}}>
    <header><h2 id={id}>{title}</h2><button aria-label="Закрыть окно макетов" onClick={close}><X size={18}/></button></header>{children}
  </dialog>,document.body);
}
export function TerminalLayoutsProvider({children,indicators}:{children:ReactNode;indicators?:WorkspaceSettings["layoutIndicators"]}){
  const preferences=useWorkspacePreferences(),{identity,settings,ready}=preferences,library=settings.layouts;
  const [dialog,setDialog]=useState<DialogState|null>(null),[input,setInput]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useFloatingNotice("terminal-layouts",dialog?"":error);
  useEffect(()=>{
    if(!identity||!ready||!indicators||library.standard)return;
    const state=workspaceSnapshot(identity).settings;if(state.layouts.standard)return;
    const initial={...state,layoutIndicators:indicators};
    updateWorkspace(identity,{layoutIndicators:indicators,layouts:{...state.layouts,standard:captureLayout(initial)}});
  },[identity,ready,indicators,library.standard]);
  const selected=library.items.find(item=>item.id===library.activeId),name=selected?.name||"Основной";
  const dirty=layoutChanged(captureLayout(settings),selected?.content||library.standard),enabled=ready&&!!library.standard;
  function current(drawings=false){window.dispatchEvent(new Event("sinex:capture-layout"));if(drawings)window.dispatchEvent(new Event("sinex:capture-layout-drawings"));return workspaceSnapshot(identity).settings;}
  async function persist(next:LayoutLibrary){
    if(!identity)throw new Error("Дождитесь загрузки настроек.");
    const previous=workspaceSnapshot(identity).settings.layouts;
    updateWorkspace(identity,{layouts:next});
    try{await saveWorkspaceNow(identity);}catch(error){updateWorkspace(identity,{layouts:previous});throw error;}
  }
  async function run(action:()=>Promise<void>){setBusy(true);setError("");try{await action();}catch(error){setError(error instanceof Error?error.message:"Не удалось сохранить макет.");}finally{setBusy(false);}}
  async function saveCurrent(){
    const state=current(true),lib=state.layouts,content=captureLayout(state);
    await persist(lib.activeId?{...lib,items:lib.items.map(item=>item.id===lib.activeId?{...item,content,savedAt:Date.now()}:item)}:{...lib,standard:content});
  }
  async function switchTo(id:string|null){
    if(!identity)return;
    const state=current(),content=id?state.layouts.items.find(item=>item.id===id)?.content:state.layouts.standard;
    if(!content)throw new Error("Макет больше недоступен.");
    updateWorkspace(identity,applyLayout(state,content,id));
    try{await saveWorkspaceNow(identity);}catch(error){updateWorkspace(identity,state);throw error;}setDialog(null);
  }
  function choose(id:string|null,back=false){
    if(id===library.activeId)return;
    const state=current(),saved=state.layouts.items.find(item=>item.id===state.layouts.activeId)?.content||state.layouts.standard;
    if(layoutChanged(captureLayout(state),saved))setDialog({type:"switch",id,back});else void run(()=>switchTo(id));
  }
  function copy(back=false){setInput(availableLayoutName(library,`${name} — копия`));setError("");setDialog({type:"name",back});}
  function rename(item:Entry){setInput(item.name);setError("");setDialog({type:"name",id:item.id,back:true});}
  function close(){if(busy)return;setError("");setDialog(dialog&&"back"in dialog&&dialog.back?{type:"manage"}:null);}
  function submit(event:FormEvent){event.preventDefault();if(dialog?.type!=="name")return;const form=dialog;void run(async()=>{
    const state=current(true),lib=state.layouts,validated=validateLayoutName(lib,input,form.id);
    if(form.id)await persist({...lib,items:lib.items.map(item=>item.id===form.id?{...item,name:validated}:item)});
    else{if(lib.items.length>=20)throw new Error("Можно сохранить до 20 макетов.");const id=crypto.randomUUID();await persist({...lib,activeId:id,items:[...lib.items,{id,name:validated,content:captureLayout(state),savedAt:Date.now()}]});}
    setDialog(form.back?{type:"manage"}:null);
  });}
  async function remove(id:string){
    const state=current(),items=state.layouts.items.filter(item=>item.id!==id);
    if(state.layouts.activeId===id&&identity){const next=items[0],content=next?.content||state.layouts.standard;if(!content)throw new Error("Стандартный макет недоступен.");updateWorkspace(identity,{...applyLayout(state,content,next?.id||null),layouts:{...state.layouts,items,activeId:next?.id||null}});try{await saveWorkspaceNow(identity);}catch(error){updateWorkspace(identity,state);throw error;}}
    else await persist({...state.layouts,items});setDialog({type:"manage"});
  }
  const actions:LayoutActions={name,dirty,busy,ready:enabled,activeId:library.activeId,items:library.items,manage:()=>{setError("");setDialog({type:"manage"});},choose,save:()=>void run(saveCurrent),copy};
  return <Context.Provider value={actions}>{children}
    {dialog&&<Modal key={dialog.type} title={dialog.type==="manage"?"Управление макетами":dialog.type==="name"?dialog.id?"Переименовать макет":"Сохранить макет как…":dialog.type==="delete"?"Удалить макет?":"Сохранить изменения?"} close={close} wide={dialog.type==="manage"}>
      {dialog.type==="manage"&&<>
        <p className="layout-description">Сохраняйте расположение панелей и настройки графика</p>
        <p className="layout-current">Текущий: <strong title={name}>{name}</strong>{dirty&&<span className="layout-changes">● Есть изменения</span>}</p>
        <div className="layout-list">
          <div className={`layout-list-row ${!selected?"is-current":""}`}><Grid2X2 size={20}/><button className="layout-row-name" onClick={()=>choose(null,true)}>Основной</button>{!selected?<small><Check size={13}/>Текущий</small>:<button className="button" disabled={busy} onClick={()=>choose(null,true)}>Применить</button>}</div>
          {library.items.map(item=><div className={`layout-list-row ${item.id===library.activeId?"is-current":""}`} key={item.id}>
            <Grid2X2 size={20}/><button className="layout-row-name" title={item.name} disabled={busy} onClick={()=>choose(item.id,true)}>{item.name}</button>
            {item.id===library.activeId?<small><Check size={13}/>Текущий</small>:<button className="button layout-apply" disabled={busy} onClick={()=>choose(item.id,true)}>Применить</button>}
            <button className="layout-icon" aria-label={`Переименовать макет ${item.name}`} disabled={busy} onClick={()=>rename(item)}><Pencil size={14}/></button>
            <button className="layout-icon" aria-label={`Удалить макет ${item.name}`} disabled={busy} onClick={()=>{setError("");setDialog({type:"delete",id:item.id});}}><Trash2 size={14}/></button>
          </div>)}
        </div>
        {error&&<p className="layout-error" role="alert">{error}</p>}
        <div className="layout-dialog-actions"><button className="button" disabled={busy||!enabled} onClick={()=>copy(true)}>Сохранить как…</button><button className="button layout-primary" disabled={busy||!dirty||!enabled} onClick={()=>void run(saveCurrent)}>{busy?<><LoaderCircle size={13} className="spinning"/>Сохранение…</>:"Сохранить текущий"}</button><button className="button layout-dismiss" disabled={busy} onClick={close}>Закрыть</button></div>
      </>}
      {dialog.type==="name"&&<form onSubmit={submit}><label>Название макета<input aria-label="Название макета" value={input} onChange={event=>{setInput(event.target.value);setError("");}} maxLength={60} required disabled={busy}/></label>{error&&<p className="layout-error" role="alert">{error}</p>}<div className="layout-dialog-actions"><button className="button" type="button" disabled={busy} onClick={close}>Отмена</button><button className="button layout-primary" type="submit" disabled={busy||!input.trim()}>{dialog.id?"Переименовать":"Создать"}</button></div></form>}
      {dialog.type==="delete"&&<><p>Удалить макет «{library.items.find(item=>item.id===dialog.id)?.name}»? {library.activeId===dialog.id&&dirty?"Его несохранённые изменения будут потеряны.":"Другие макеты сохранятся."}</p>{error&&<p className="layout-error" role="alert">{error}</p>}<div className="layout-dialog-actions"><button className="button" disabled={busy} onClick={()=>setDialog({type:"manage"})}>Отмена</button><button className="button layout-danger" disabled={busy} onClick={()=>void run(()=>remove(dialog.id))}>Удалить</button></div></>}
      {dialog.type==="switch"&&<><p>В макете «{name}» есть несохранённые изменения.</p>{error&&<p className="layout-error" role="alert">{error}</p>}<div className="layout-dialog-actions"><button className="button" disabled={busy} onClick={close}>Отмена</button><button className="button" disabled={busy} onClick={()=>void run(()=>switchTo(dialog.id))}>Перейти без сохранения</button><button className="button layout-primary" disabled={busy} onClick={()=>void run(async()=>{await saveCurrent();await switchTo(dialog.id);})}>Сохранить и перейти</button></div></>}
    </Modal>}
  </Context.Provider>;
}
export function LayoutStatus(){
  const layouts=useContext(Context);if(!layouts)return null;
  return <button className="current-layout" title={`Макет: ${layouts.name}${layouts.dirty?" — есть несохранённые изменения":""}`} onClick={layouts.manage} aria-label={`Макет: ${layouts.name}`}><span>Макет: {layouts.name}</span>{layouts.dirty&&<b aria-label="Несохранённые изменения">●</b>}</button>;
}
export function AccountLayoutsMenu({dismiss}:{dismiss:()=>void}){
  const layouts=useContext(Context),[expanded,setExpanded]=useState(false),trigger=useRef<HTMLButtonElement>(null);
  if(!layouts)return null;
  const act=(action:()=>void)=>{dismiss();action();};
  return <div className="account-layouts" onKeyDown={event=>{if(expanded&&(event.key==="ArrowRight"||event.key==="Escape")){event.stopPropagation();setExpanded(false);trigger.current?.focus();}else if(event.key==="ArrowLeft"){event.stopPropagation();setExpanded(true);}}}>
    <button ref={trigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><Grid2X2 size={15}/>Макеты<ChevronLeft size={12}/></button>
    {expanded&&<div className="account-layout-submenu" role="menu" aria-label="Макеты"><strong>Макеты</strong>
      <button role="menuitemradio" aria-checked={!layouts.activeId} disabled={!layouts.ready||layouts.busy} onClick={()=>act(()=>layouts.choose(null))}><Check size={13} style={{visibility:!layouts.activeId?"visible":"hidden"}}/><span>Основной</span></button>
      {layouts.items.map(item=><button key={item.id} role="menuitemradio" title={item.name} aria-checked={item.id===layouts.activeId} disabled={layouts.busy} onClick={()=>act(()=>layouts.choose(item.id))}><Check size={13} style={{visibility:item.id===layouts.activeId?"visible":"hidden"}}/><span>{item.name}</span>{item.id===layouts.activeId&&layouts.dirty&&<b className="layout-dot">●</b>}</button>)}
      <div className="layout-menu-separator"/>
      <button role="menuitem" disabled={!layouts.ready||!layouts.dirty||layouts.busy} onClick={()=>act(layouts.save)}><Save size={14}/>{layouts.busy?"Сохранение…":"Сохранить текущий"}</button>
      <button role="menuitem" disabled={!layouts.ready||layouts.busy} onClick={()=>act(()=>layouts.copy())}><Copy size={14}/>Сохранить как…</button>
      <div className="layout-menu-separator"/>
      <button role="menuitem" onClick={()=>act(layouts.manage)}><Settings2 size={14}/>Управление макетами…</button>
      <button role="menuitem" disabled={!layouts.ready||layouts.busy} onClick={()=>act(()=>layouts.copy())}><Plus size={14}/>Создать макет</button>
    </div>}
  </div>;
}
