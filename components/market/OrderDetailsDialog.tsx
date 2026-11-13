"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import {useDraggableDialog} from "@/hooks/use-draggable-dialog";
import type {useDemoOrders} from "@/hooks/use-demo-orders";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {ATOMS,isOpen,orderNames,type DemoOrder} from "@/lib/paper/orders";
import {paperAmount,paperDecimals,paperOrderStatus} from "@/lib/paper/account";
import {useFloatingNotice} from "@/components/FloatingNotices";
const number=(value:number)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:12}).format(value);
export function OrderDetailsDialog({order:initial,orders,close}:{order:DemoOrder;orders:ReturnType<typeof useDemoOrders>;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),floating=useDraggableDialog(dialog,"order"),[busy,setBusy]=useState(false),[error,setError]=useState(""),inFlight=useRef(false);
  const order=orders.data?.orders.find(o=>o.id===initial.id)??initial;
  const currency=order.side==="buy"?order.quote:order.base;
  useFloatingNotice(`order-details:${order.id}`,error);
  function closeWindow(){floating.remember();close();}
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape"||event.defaultPrevented||document.querySelector("dialog:modal"))return;
      const dialogs=[...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter(node=>node.getClientRects().length>0);
      const top=dialogs.reduce<HTMLDialogElement|undefined>((current,node)=>!current||Number(getComputedStyle(node).zIndex||0)>=Number(getComputedStyle(current).zIndex||0)?node:current,undefined);
      if(top!==dialog.current)return;
      event.preventDefault();event.stopImmediatePropagation();floating.remember();close();
    };
    window.addEventListener("keydown",escape,true);return()=>window.removeEventListener("keydown",escape,true);
  },[floating,close]);
  async function cancel(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");try{await orders.request({action:"cancel",id:order.id});}catch(e){setError(e instanceof Error?e.message:"Не удалось отменить заявку");}finally{inFlight.current=false;setBusy(false);}}
  const metric=(label:string,value:string)=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>;
  return createPortal(<dialog ref={dialog} className="account-dialog demo-order-dialog order-details-dialog" aria-modal="false" aria-labelledby="order-details-title" style={{left:floating.position.x,top:floating.position.y}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeWindow();}}}>
    <header className="demo-order-heading" tabIndex={0} aria-label="Переместить заявку" onPointerDown={floating.start} onPointerMove={floating.move} onPointerUp={floating.end} onPointerCancel={floating.end} onLostPointerCapture={floating.end} onKeyDown={floating.key}>
      <div><h2 id="order-details-title">Детали заявки</h2><p className="demo-instrument">{order.base}/{order.quote} · {EXCHANGES[order.exchange].name}</p></div><button onClick={closeWindow} aria-label="Закрыть заявку"><X size={17}/></button>
    </header>
    <div className="demo-order-body"><div className="order-details-state"><strong className={order.side==="buy"?"positive":"negative"}>{order.side==="buy"?"Покупка":"Продажа"} · {orderNames[order.type]}</strong><span>{isOpen(order)&&!order.triggered?"Ожидает стоп-цены":paperOrderStatus(order.status)}</span></div>
      <dl className="order-details-metrics">
        {order.limit!=null&&metric("Лимитная цена",`${number(order.limit)} ${order.quote}`)}
        {order.stop!=null&&metric("Стоп-цена",`${number(order.stop)} ${order.quote}`)}
        {metric("Количество",`${number(order.quantity/ATOMS)} ${order.base}`)}
        {metric("Исполнено",`${number(order.filled/ATOMS)} ${order.base}`)}
        {metric("Осталось",`${number((order.quantity-order.filled)/ATOMS)} ${order.base}`)}
        {metric("Зарезервировано",`${paperAmount(order.reserved,paperDecimals(currency))} ${currency}`)}
        {order.filled>0&&metric("Средняя цена исполнения",`${number(order.cost/10**paperDecimals(order.quote)/(order.filled/ATOMS))} ${order.quote}`)}
        {order.filled>0&&metric("Комиссия",`${paperAmount(order.fee,paperDecimals(order.quote))} ${order.quote}`)}
        {metric("Создана",new Date(order.createdAt).toLocaleString("ru-RU"))}
      </dl>
      <p className="order-details-id" title={order.id}>ID · {order.id}</p>
      {isOpen(order)&&<button type="button" className="button order-details-cancel" disabled={busy} onClick={()=>void cancel()}>{busy?"Отменяем…":"Отменить заявку"}</button>}
    </div>
  </dialog>,document.body);
}
