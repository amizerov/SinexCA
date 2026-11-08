"use client";
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {fitWindow,readWindowLayout,type WindowLayout} from "@/lib/ui/floating-window";
import {useWorkspacePreferences} from "./use-workspace-preferences";
type Edge="n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw";
interface Gesture {pointerId:number;x:number;y:number;layout:WindowLayout;edge?:Edge;element:HTMLElement}
const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
export function useFloatingWindow(kind:"orderBook"|"markets"|"trades"="orderBook"){
  const preferences=useWorkspacePreferences(),saved=kind==="trades"?preferences.settings.tradesWindow:kind==="markets"?preferences.settings.marketWindow:preferences.settings.orderBookWindow;
  const initial=()=>typeof window==="undefined"?{x:8,y:88,width:300,height:480}:saved?fitWindow(saved,viewport()):kind==="trades"?fitWindow({x:window.innerWidth-340,y:Math.max(88,window.innerHeight-430),width:320,height:400},viewport()):kind==="markets"?fitWindow({x:window.innerWidth-356,y:88,width:340,height:560},viewport()):readWindowLayout(null,viewport());
  const [state,setState]=useState(()=>({source:saved,layout:initial()}));
  if(state.source!==saved)setState({source:saved,layout:initial()});
  const layout=state.layout;
  const setLayout=(layout:WindowLayout)=>setState(previous=>({...previous,layout}));
  const current=useRef(layout),gesture=useRef<Gesture|null>(null);
  useEffect(()=>{current.current=layout;},[layout]);
  const save=preferences.update;
  function persist(value:WindowLayout){save(kind==="trades"?{tradesWindow:value}:kind==="markets"?{marketWindow:value}:{orderBookWindow:value});}
  function commit(value:WindowLayout){const fitted=fitWindow(value,viewport());current.current=fitted;setLayout(fitted);return fitted;}
  useEffect(()=>{
    const resize=()=>{const fitted=fitWindow(current.current,viewport());current.current=fitted;setState(previous=>({...previous,layout:fitted}));save(kind==="trades"?{tradesWindow:fitted}:kind==="markets"?{marketWindow:fitted}:{orderBookWindow:fitted});};
    window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);
  },[save,kind]);
  function start(event:ReactPointerEvent<HTMLElement>,edge?:Edge){
    if(event.button!==0||(!edge&&(event.target as HTMLElement).closest("button")))return;
    event.preventDefault();event.currentTarget.focus({preventScroll:true});
    gesture.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,layout:current.current,edge,element:event.currentTarget};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:ReactPointerEvent<HTMLElement>){
    const active=gesture.current;if(!active||active.pointerId!==event.pointerId)return;
    const dx=event.clientX-active.x,dy=event.clientY-active.y,next={...active.layout},bounds=viewport();
    if(!active.edge){next.x+=dx;next.y+=dy;}
    else{
      const right=next.x+next.width,bottom=next.y+next.height,minWidth=Math.min(260,bounds.width-16),minHeight=Math.min(180,bounds.height-16);
      if(active.edge.includes("e"))next.width=Math.max(minWidth,Math.min(next.width+dx,bounds.width-next.x-8));
      if(active.edge.includes("s"))next.height=Math.max(minHeight,Math.min(next.height+dy,bounds.height-next.y-8));
      if(active.edge.includes("w")){next.x=Math.max(8,Math.min(next.x+dx,right-minWidth));next.width=right-next.x;}
      if(active.edge.includes("n")){next.y=Math.max(8,Math.min(next.y+dy,bottom-minHeight));next.height=bottom-next.y;}
    }
    commit(next);
  }
  function end(event:ReactPointerEvent<HTMLElement>){const active=gesture.current;if(!active||active.pointerId!==event.pointerId)return;gesture.current=null;persist(current.current);if(active.element.hasPointerCapture(event.pointerId))active.element.releasePointerCapture(event.pointerId);}
  function key(event:ReactKeyboardEvent<HTMLElement>,resize=false){
    if(event.target!==event.currentTarget||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const next={...current.current},step=event.shiftKey?1:10;
    if(resize){next.width+=(event.key==="ArrowRight"?step:event.key==="ArrowLeft"?-step:0);next.height+=(event.key==="ArrowDown"?step:event.key==="ArrowUp"?-step:0);}
    else{next.x+=(event.key==="ArrowRight"?step:event.key==="ArrowLeft"?-step:0);next.y+=(event.key==="ArrowDown"?step:event.key==="ArrowUp"?-step:0);}
    persist(commit(next));
  }
  return {layout,start,move,end,key};
}
