"use client";
import { createContext,useContext,useState,useEffect,useCallback,useRef,type ReactNode,type FormEvent } from "react";
import { UserRound,X,LogOut,ChevronDown,Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {createPortal} from "react-dom";
import {useDraggableDialog} from "@/hooks/use-draggable-dialog";
import {useRouter} from "next/navigation";
import type { AccountSession,AccountUser } from "@/lib/auth/types";
import {ProfileEditor} from "./ProfileEditor";
import {flushWorkspacePreferences} from "@/lib/ui/workspace-client";
type Session=AccountSession & {googleAvailable:boolean};
const Context=createContext<{session:Session|null;refresh:()=>Promise<void>;changed:()=>Promise<void>}>({session:null,refresh:async()=>{},changed:async()=>{}});
export const useAccount=()=>useContext(Context);
// Share the first request in React Strict Mode so two guest cookies cannot race.
let pending:Promise<Session>|null=null;
function loadSession() {
  return pending??=(async()=>{const response=await fetch("/api/auth/session",{cache:"no-store"});const result=await response.json();if(!response.ok) throw new Error(result.error?.message);return result.data as Session;})().finally(()=>{pending=null;});
}
export function AccountProvider({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null);
  const refresh=useCallback(async()=>{try{setSession(await loadSession());}catch{/* Quotes remain usable if account storage is temporarily unavailable. */}},[]);
  const changed=useCallback(async()=>{await refresh();try{localStorage.setItem("sinex:account",crypto.randomUUID());}catch{/* Storage may be blocked; the focus handler still refreshes other tabs. */}},[refresh]);
  useEffect(()=>{
    void Promise.resolve().then(refresh);const focus=()=>void refresh(),storage=(event:StorageEvent)=>{if(event.key==="sinex:account") void refresh();};
    window.addEventListener("focus",focus);window.addEventListener("storage",storage);
    return()=>{window.removeEventListener("focus",focus);window.removeEventListener("storage",storage);};
  },[refresh]);
  return <Context.Provider value={{session,refresh,changed}}>{children}</Context.Provider>;
}
function GoogleMark(){return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#fbbc05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.3H5.7a20.4 20.4 0 0 0 0 18.4l6.9-5.3Z"/><path fill="#ea4335" d="M24 11.2c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 3a20.4 20.4 0 0 0-18.3 11.3l6.9 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>;}
function AccountAvatar({user,large=false}:{user:AccountUser;large?:boolean}) {
  const [failedUrl,setFailedUrl]=useState<string|null>(null);
  const initials=(user.displayName||user.email).split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]||"").join("").toLocaleUpperCase();
  return <span className={`account-avatar${large?" account-avatar-large":""}`} aria-hidden="true">{user.avatarUrl&&failedUrl!==user.avatarUrl?<Image unoptimized src={user.avatarUrl} alt="" width={large?56:26} height={large?56:26} referrerPolicy="no-referrer" onError={()=>setFailedUrl(user.avatarUrl)}/>:initials}</span>;
}
function AccountMenu({user,busy,profile,account,logout}:{user:AccountUser;busy:boolean;profile:()=>void;account:()=>void;logout:()=>void}){
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setOpen(false);trigger.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  return <div className="account-menu-wrap" ref={root}><button ref={trigger} className="account-button" disabled={busy} aria-label={`Аккаунт ${user.email}`} title={user.email} aria-haspopup="menu" aria-expanded={open} aria-controls={open?"account-dropdown-menu":undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setOpen(true);}}}><AccountAvatar key={user.id} user={user}/><span className="account-label">{user.displayName||"Аккаунт"}</span><ChevronDown size={12}/></button>{open&&<div className="account-dropdown" id="account-dropdown-menu" role="menu" aria-label="Меню аккаунта" onKeyDown={event=>{if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')],index=items.indexOf(document.activeElement as HTMLElement),next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;items[next]?.focus();}}><button type="button" role="menuitem" onClick={()=>{setOpen(false);profile();}}><UserRound size={15}/>Профиль</button><Link role="menuitem" href="/account" onClick={event=>{event.preventDefault();setOpen(false);account();}}><Wallet size={15}/>Аккаунт</Link><button type="button" className="account-menu-logout" role="menuitem" onClick={()=>{setOpen(false);logout();}}><LogOut size={15}/>Выйти</button></div>}</div>;
}
function ProfileWindow({children,close}:{children:ReactNode;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),floating=useDraggableDialog(dialog,"profile");
  function closeWindow(){floating.remember();close();}
  return createPortal(<dialog ref={dialog} className="account-dialog profile-window" aria-modal="false" aria-labelledby="profile-window-title" style={{left:floating.position.x,top:floating.position.y}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeWindow();}}}>
    <header className="demo-order-heading" tabIndex={0} aria-label="Переместить профиль" title="Перетащите за шапку" onPointerDown={floating.start} onPointerMove={floating.move} onPointerUp={floating.end} onPointerCancel={floating.end} onLostPointerCapture={floating.end} onKeyDown={floating.key}><h2 id="profile-window-title">Профиль</h2><button onClick={closeWindow} aria-label="Закрыть"><X size={19}/></button></header>
    <div className="profile-window-body">{children}</div>
  </dialog>,document.body);
}
export function AccountButton() {
  const {session,changed}=useAccount();const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false),[tab,setTab]=useState<"login"|"register">("login"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[ownerSetup,setOwnerSetup]=useState(false);
  const [actionError,setActionError]=useState("");
  const router=useRouter();
  useEffect(()=>{const query=new URLSearchParams(location.search),code=query.get("auth_error");if(code){queueMicrotask(()=>{setError(code==="LINK_REQUIRED"?"Для этого email уже есть аккаунт. Войдите с email и паролем.":code==="GOOGLE_UNAVAILABLE"?"Вход через Google пока недоступен.":"Не удалось войти через Google. Попробуйте ещё раз.");setOpen(true);});query.delete("auth_error");history.replaceState(null,"",`${location.pathname}${query.size?`?${query}`:""}${location.hash}`);}},[]);
  const hasUser=!!session?.user;
  useEffect(()=>{if(open&&!hasUser) dialog.current?.showModal();else dialog.current?.close();},[open,hasUser]);
  async function waitForDrawings() {
    await flushWorkspacePreferences();
    for(let i=0;i<60;i++) {
      if(document.querySelector('[data-preferences-status="saving"]')){await new Promise(resolve=>setTimeout(resolve,200));continue;}
      const state=document.querySelector("[data-save-status]")?.getAttribute("data-save-status");
      if(!state||state==="saved")return;
      if(state==="error"||state==="conflict")throw new Error("Сначала сохраните разметку или загрузите сохранённые уровни на графике.");
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    throw new Error("Дождитесь сохранения разметки и повторите вход.");
  }
  async function google(){setBusy(true);setError("");try{await waitForDrawings();window.location.href=new URL("/api/auth/google",window.location.origin).href;}catch(cause){setError(cause instanceof Error?cause.message:"Не удалось продолжить.");setBusy(false);}}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");setBusy(true);
    try {
      const fields=Object.fromEntries(new FormData(event.currentTarget));
      await waitForDrawings();
      if(tab==="register"&&fields.password!==fields.confirmPassword) throw new Error("Пароли не совпадают.");
      const response=await fetch(`/api/auth/${tab}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)}),result=await response.json();
      if(!response.ok){if(result.error?.code==="OWNER_SETUP_REQUIRED")setOwnerSetup(true);throw new Error(result.error?.message||"Не удалось войти.");}
      await changed();setOpen(false);setOwnerSetup(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"Нет соединения с сервером.");}finally{setBusy(false);}
  }
  async function navigateAccount(){setBusy(true);setError("");setActionError("");setOpen(false);try{await waitForDrawings();router.push("/account");}catch(cause){setActionError(cause instanceof Error?cause.message:"Не удалось открыть аккаунт.");}finally{setBusy(false);}}
  async function logout(){setBusy(true);setActionError("");setOpen(false);try{await waitForDrawings();const response=await fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(!response.ok)throw new Error("Не удалось выйти.");await changed();}catch(cause){setActionError(cause instanceof Error?cause.message:"Не удалось выйти. Повторите попытку.");}finally{setBusy(false);}}
  return <>
    {actionError&&createPortal(<div className="account-action-error" role="alert"><span>{actionError}</span><button aria-label="Закрыть сообщение" onClick={()=>setActionError("")}><X size={16}/></button></div>,document.body)}
    {session?.user?<AccountMenu key={`account-menu:${session.user.id}`} user={session.user} busy={busy} profile={()=>{setError("");setOpen(true);}} account={()=>{void navigateAccount();}} logout={()=>{void logout();}}/>:<button className="account-button" onClick={()=>{setError("");setOpen(true);}} aria-label="Войти в Sinex broker" title="Вход и регистрация"><UserRound size={17}/><span className="account-label">Войти</span></button>}
    {open&&session?.user&&<ProfileWindow key={`profile-window:${session.user.id}`} close={()=>setOpen(false)}><ProfileEditor user={session.user} ownerId={session.ownerId} avatar={<AccountAvatar key={session.user.id} user={session.user} large/>} changed={changed} onBusy={setBusy}/>{error&&<p className="account-error" role="alert">{error}</p>}</ProfileWindow>}
    <dialog ref={dialog} className="account-dialog" onCancel={()=>setOpen(false)} onClose={()=>{if(!session?.user)setOpen(false);}} onClick={event=>{if(event.target===dialog.current){const box=dialog.current.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setOpen(false);}}} aria-labelledby="account-title">
      <button className="account-close" onClick={()=>setOpen(false)} aria-label="Закрыть"><X size={19}/></button>
      <h2 id="account-title">{session?.user?"Профиль":"Добро пожаловать в Sinex broker"}</h2>
      {session?.user?null:<>
        <button className="google-button" disabled={!session?.googleAvailable||busy} onClick={()=>void google()}><GoogleMark/>Продолжить с Google</button>
        {session&&!session.googleAvailable&&<p className="account-hint google-unavailable">Вход через Google пока недоступен</p>}
        <div className="account-tabs"><button aria-pressed={tab==="login"} onClick={()=>{setTab("login");setError("");}}>Вход</button><button aria-pressed={tab==="register"} onClick={()=>{setTab("register");setError("");}}>Регистрация</button></div>
        <form onSubmit={submit} key={tab}>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
          <label>Пароль<input name="password" type="password" autoComplete={tab==="register"?"new-password":"current-password"} required minLength={tab==="register"?10:1} maxLength={128}/></label>
          {tab==="register"&&<><label>Повторите пароль<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/></label>{ownerSetup&&<label>Одноразовый код владельца<input name="ownerCode" autoComplete="off" required maxLength={128}/></label>}</>}
          <button className="account-submit" disabled={busy||!session}>{busy?"Подождите…":tab==="register"?"Создать аккаунт":"Войти"}</button>
        </form>
      </>}
      {error&&<p className="account-error" role="alert">{error}</p>}
    </dialog>
  </>;
}
