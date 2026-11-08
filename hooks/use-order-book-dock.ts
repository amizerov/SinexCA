"use client";
import {useRef,useState,useSyncExternalStore,type PointerEvent,type KeyboardEvent} from "react";
const media="(min-width: 1100px)";
function subscribe(change:()=>void){const query=window.matchMedia(media);query.addEventListener("change",change);return()=>query.removeEventListener("change",change);}
const snapshot=()=>window.matchMedia(media).matches,serverSnapshot=()=>false;
export function useDockViewport(){return useSyncExternalStore(subscribe,snapshot,serverSnapshot);}
export function useOrderBookDock(saved:number,save:(width:number)=>void,minimum=230,maximum=560){
  const wide=useDockViewport();
  const [state,setState]=useState({source:saved,width:saved});
  if(state.source!==saved)setState({source:saved,width:saved});
  const gesture=useRef<{x:number;width:number;pointer:number;next:number}|null>(null);
  const clamp=(width:number)=>Math.min(maximum,Math.max(minimum,Math.round(width)));
  function start(event:PointerEvent<HTMLElement>){if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();gesture.current={x:event.clientX,width:state.width,pointer:event.pointerId,next:state.width};event.currentTarget.setPointerCapture(event.pointerId);}
  function move(event:PointerEvent<HTMLElement>,reverse=false){const active=gesture.current;if(!active||active.pointer!==event.pointerId)return;active.next=clamp(active.width+(event.clientX-active.x)*(reverse?-1:1));setState(old=>({...old,width:active.next}));}
  function end(event:PointerEvent<HTMLElement>){const active=gesture.current;if(!active||active.pointer!==event.pointerId)return;gesture.current=null;save(active.next);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  function key(event:KeyboardEvent<HTMLElement>,reverse=false){if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();event.stopPropagation();save(clamp(state.width+(event.key==="ArrowLeft"?-1:1)*(event.shiftKey?1:10)*(reverse?-1:1)));}
  return {wide,width:state.width,start,move,end,key};
}
