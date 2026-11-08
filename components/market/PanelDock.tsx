"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from "react";
import {createPortal} from "react-dom";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {fitWindow,type WindowLayout} from "@/lib/ui/floating-window";
type Kind="markets"|"trades";
type Side="left"|"right";
type Target={side:Side;anchor?:Kind;before?:boolean;axis?:"horizontal"|"vertical";rect:WindowLayout};
interface DockContext {start:(kind:Kind,event:ReactPointerEvent<HTMLElement>)=>void;place:(kind:Kind,mode:Side|"floating")=>void}
const Context=createContext<DockContext|null>(null);
export function usePanelDock(){const value=useContext(Context);if(!value)throw new Error("PanelDockProvider is missing");return value;}
export function PanelDockProvider({children}:{children:ReactNode}){
  const preferences=useWorkspacePreferences(),latest=useRef(preferences),cleanup=useRef<(()=>void)|null>(null),[target,setTarget]=useState<Target|null>(null);
  useEffect(()=>{latest.current=preferences;},[preferences]);
  useEffect(()=>()=>{cleanup.current?.();},[preferences.identity?.ownerId]);
  function place(kind:Kind,mode:Side|"floating"){
    const {settings,update}=latest.current;
    if(kind==="markets")update({marketPanel:{...settings.marketPanel,mode}});
    else update({tradesDocked:mode!=="floating",...mode!=="floating"?{tradesSide:mode}:{}});
  }
  function start(kind:Kind,event:ReactPointerEvent<HTMLElement>){
    if(event.button!==0||(event.target as HTMLElement).closest("button,input,select,a"))return;
    const source=event.currentTarget.closest<HTMLElement>("[data-dock-panel]");if(!source)return;const node:HTMLElement=source;
    cleanup.current?.();event.preventDefault();event.currentTarget.focus({preventScroll:true});
    const original=node.getBoundingClientRect(),origin={x:event.clientX,y:event.clientY},offset={x:Math.min(event.clientX-original.left,original.width-20),y:event.clientY-original.top};
    const width=original.width,height=node.closest(".terminal-side-column")?Math.min(original.height,520):original.height;
    let ghost:HTMLElement|null=null,active=false,current:Target|null=null,layout=fitWindow({x:original.left,y:original.top,width,height},{width:window.innerWidth,height:window.innerHeight});
    const opacity=node.style.opacity,selection=document.body.style.userSelect;
    const bounds=()=>({width:window.innerWidth,height:window.innerHeight});
    function locate(x:number,y:number):Target|null{
      if(window.innerWidth<1100)return null;
      const others=[...document.querySelectorAll<HTMLElement>("[data-dock-panel]")].filter(n=>n!==node&&!n.hasAttribute("data-drag-ghost"));
      function at(other:HTMLElement,side?:Side):Target{
        const r=other.getBoundingClientRect(),horizontal=x<r.left+r.width*.2||x>r.right-r.width*.2,before=horizontal?x<r.left+r.width/2:y<r.top+r.height/2;
        return {side:side??(other.closest<HTMLElement>("[data-dock-side]")?.dataset.dockSide as Side|undefined)??(r.left+r.width/2<window.innerWidth/2?"left":"right"),anchor:other.dataset.dockPanel as Kind,before,axis:horizontal?"horizontal":"vertical",rect:horizontal?{x:before?r.left:r.left+r.width/2,y:r.top,width:r.width/2,height:r.height}:{x:r.left,y:before?r.top:r.top+r.height/2,width:r.width,height:r.height/2}};
      }
      const over=others.find(n=>{const r=n.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});if(over)return at(over);
      const edge=Math.min(140,window.innerWidth*.1),side=x<edge?"left":x>window.innerWidth-edge?"right":null;if(!side)return null;
      const other=others.find(n=>n.closest<HTMLElement>("[data-dock-side]")?.dataset.dockSide===side);if(other)return at(other,side);
      const workspace=document.querySelector(".workspace")?.getBoundingClientRect(),top=workspace?.top??60,w=Math.min(340,window.innerWidth*.28);
      return {side,rect:{x:side==="left"?8:window.innerWidth-w-8,y:top+8,width:w,height:Math.max(180,window.innerHeight-top-24)}};
    }
    function move(e:PointerEvent){
      if(e.pointerId!==event.pointerId)return;
      if(!active&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<6)return;
      if(!active){active=true;ghost=node.cloneNode(true) as HTMLElement;ghost.setAttribute("data-drag-ghost","");ghost.removeAttribute("data-dock-panel");ghost.setAttribute("aria-hidden","true");ghost.inert=true;ghost.removeAttribute("id");for(const child of ghost.querySelectorAll("[id]"))child.removeAttribute("id");Object.assign(ghost.style,{position:"fixed",margin:"0",inset:"auto",maxWidth:"none",minHeight:"0",display:"flex",flexDirection:"column",pointerEvents:"none",zIndex:"200",opacity:".9",boxShadow:"0 12px 35px #0009",border:"1px solid #9bd67a",width:`${width}px`,height:`${height}px`});document.body.append(ghost);node.style.opacity=".3";document.body.style.userSelect="none";}
      layout=fitWindow({x:e.clientX-offset.x,y:e.clientY-offset.y,width,height},bounds());Object.assign(ghost!.style,{left:`${layout.x}px`,top:`${layout.y}px`,width:`${layout.width}px`,height:`${layout.height}px`});
      current=locate(e.clientX,e.clientY);setTarget(previous=>JSON.stringify(previous)===JSON.stringify(current)?previous:current);
    }
    function finish(e:PointerEvent){if(e.pointerId!==event.pointerId)return;const destination=current,moved=active;stop();if(!moved)return;
      const {settings,update}=latest.current;
      if(!destination){update(kind==="markets"?{marketPanel:{...settings.marketPanel,mode:"floating"},marketWindow:layout}:{tradesDocked:false,tradesWindow:layout});return;}
      const {side,anchor,before,axis}=destination;
      const order=anchor?(kind==="markets"?before:!before)?"markets-first":"trades-first":settings.sidePanelOrder;
      update({...(kind==="markets"||anchor==="markets")?{marketPanel:{...settings.marketPanel,mode:side}}:{},...(kind==="trades"||anchor==="trades")?{tradesDocked:true,tradesSide:side}:{},...anchor?{sidePanelLayout:axis==="horizontal"?"columns":"stacked",sidePanelOrder:order,sidePanelSplit:order===settings.sidePanelOrder?settings.sidePanelSplit:Number((1-settings.sidePanelSplit).toFixed(4))}:{}});
    }
    function key(e:KeyboardEvent){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();stop();}}
    function stop(){ghost?.remove();ghost=null;node.style.opacity=opacity;document.body.style.userSelect=selection;setTarget(null);window.removeEventListener("pointermove",move,true);window.removeEventListener("pointerup",finish,true);window.removeEventListener("pointercancel",stop);window.removeEventListener("keydown",key,true);window.removeEventListener("blur",stop);window.removeEventListener("resize",stop);if(document.body.hasPointerCapture(event.pointerId))document.body.releasePointerCapture(event.pointerId);cleanup.current=null;}
    cleanup.current=stop;document.body.setPointerCapture(event.pointerId);window.addEventListener("pointermove",move,true);window.addEventListener("pointerup",finish,true);window.addEventListener("pointercancel",stop);window.addEventListener("keydown",key,true);window.addEventListener("blur",stop);window.addEventListener("resize",stop);
  }
  return <Context.Provider value={{start,place}}>{children}{target&&createPortal(<div className="panel-dock-preview" style={{left:target.rect.x,top:target.rect.y,width:target.rect.width,height:target.rect.height}} role="status">{target.anchor?target.axis==="horizontal"?target.before?"Закрепить рядом слева":"Закрепить рядом справа":target.before?"Закрепить сверху":"Закрепить снизу":target.side==="left"?"Закрепить слева":"Закрепить справа"}</div>,document.body)}</Context.Provider>;
}
