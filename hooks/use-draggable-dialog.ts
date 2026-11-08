"use client";
import {useEffect,useRef,useState,type RefObject,type PointerEvent,type KeyboardEvent} from "react";
import {useWorkspacePreferences} from "./use-workspace-preferences";
type Position={x:number;y:number};
export function useDraggableDialog(dialog:RefObject<HTMLDialogElement|null>,kind:"order"|"profile"){
  const preferences=useWorkspacePreferences(),saved=kind==="order"?preferences.settings.orderDialogPosition:preferences.settings.profileDialogPosition;
  const source=JSON.stringify([preferences.identity?.ownerId,saved]);
  const fallback=()=>({x:typeof window==="undefined"?8:Math.max(8,window.innerWidth-370),y:typeof window==="undefined"?8:Math.min(88,Math.max(8,window.innerHeight-200))});
  const [state,setState]=useState(()=>({source,position:saved??fallback()}));
  if(state.source!==source)setState({source,position:saved??fallback()});
  const position=state.position;
  const gesture=useRef<{id:number;x:number;y:number;left:number;top:number;position:Position}|null>(null);
  function fit(x:number,y:number){const rect=dialog.current?.getBoundingClientRect();return {x:Math.max(8,Math.min(x,window.innerWidth-(rect?.width??350)-8)),y:Math.max(8,Math.min(y,window.innerHeight-(rect?.height??180)-8))};}
  function persist(value:Position){preferences.update(kind==="order"?{orderDialogPosition:value}:{profileDialogPosition:value});}
  function commit(value:Position){setState(previous=>({...previous,position:value}));}
  function remember(){const rect=dialog.current?.getBoundingClientRect();if(rect?.width)persist(fit(rect.left,rect.top));}
  useEffect(()=>{
    const element=dialog.current;if(!element)return;if(!element.open)element.show();
    const resize=()=>setState(previous=>{const p=previous.position,r=element.getBoundingClientRect(),x=Math.max(8,Math.min(p.x,window.innerWidth-r.width-8)),y=Math.max(8,Math.min(p.y,window.innerHeight-r.height-8));return x===p.x&&y===p.y?previous:{...previous,position:{x,y}};});
    const observer=new ResizeObserver(resize);observer.observe(element);window.addEventListener("resize",resize);resize();return()=>{observer.disconnect();window.removeEventListener("resize",resize);};
  },[dialog,source]);
  function start(e:PointerEvent<HTMLElement>){if(e.button!==0||(e.target as HTMLElement).closest("button"))return;const r=dialog.current?.getBoundingClientRect();if(!r)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,position:{x:r.left,y:r.top}};e.currentTarget.setPointerCapture(e.pointerId);}
  function move(e:PointerEvent<HTMLElement>){const g=gesture.current;if(g?.id===e.pointerId){g.position=fit(g.left+e.clientX-g.x,g.top+e.clientY-g.y);commit(g.position);}}
  function end(e:PointerEvent<HTMLElement>){const g=gesture.current;if(g?.id!==e.pointerId)return;gesture.current=null;persist(g.position);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  function key(e:KeyboardEvent<HTMLElement>){if(e.target!==e.currentTarget||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();const step=e.shiftKey?1:10;const next=fit(position.x+(e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0),position.y+(e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0));commit(next);persist(next);}
  return {position,start,move,end,key,remember};
}
