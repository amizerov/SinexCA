"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {AlertTriangle,X} from "lucide-react";

type Tone="warning"|"error";
interface Notice {id:string;message:string;tone:Tone;actionLabel?:string;action?:()=>void}
const NoticeContext=createContext<((id:string,notice:Notice|null)=>void)|null>(null);

export function FloatingNoticesProvider({children}:{children:ReactNode}){
  const [notices,setNotices]=useState<Map<string,Notice>>(()=>new Map());
  const publish=useCallback((id:string,notice:Notice|null)=>setNotices(current=>{
    const existing=current.get(id);
    if(!notice&&!existing)return current;
    if(notice&&existing?.message===notice.message&&existing.tone===notice.tone&&existing.actionLabel===notice.actionLabel&&!!existing.action===!!notice.action)return current;
    const next=new Map(current);if(notice)next.set(id,notice);else next.delete(id);return next;
  }),[]);
  const value=useMemo(()=>publish,[publish]);
  const visible=useMemo(()=>[...new Map([...notices.values()].map(notice=>[notice.message,notice])).values()],[notices]);
  const dismiss=useCallback((message:string)=>setNotices(current=>new Map([...current].filter(([,notice])=>notice.message!==message))),[]);
  return <NoticeContext.Provider value={value}>{children}<div className="floating-notices" aria-label="Уведомления">
    {visible.map(notice=><div key={notice.id} className={`floating-notice error-banner ${notice.tone}`} role="alert">
      <AlertTriangle size={16} aria-hidden="true"/><span>{notice.message}</span>
      {notice.action&&<button type="button" className="floating-notice-action" onClick={notice.action}>{notice.actionLabel||"Повторить"}</button>}
      <button type="button" className="floating-notice-close" aria-label="Закрыть уведомление" onClick={()=>dismiss(notice.message)}><X size={15}/></button>
    </div>)}
  </div></NoticeContext.Provider>;
}

export function useFloatingNotice(id:string,message:string|undefined,options:{tone?:Tone;actionLabel?:string;action?:()=>void}={}){
  const publish=useContext(NoticeContext),actionRef=useRef(options.action);
  useEffect(()=>{actionRef.current=options.action;},[options.action]);
  const hasAction=!!options.action,tone=options.tone||"error",label=options.actionLabel;
  useEffect(()=>{
    if(!publish)return;
    if(!message){publish(id,null);return;}
    publish(id,{id,message,tone,actionLabel:label,...hasAction?{action:()=>actionRef.current?.()}:{}});
    return()=>publish(id,null);
  },[publish,id,message,tone,label,hasAction]);
}
