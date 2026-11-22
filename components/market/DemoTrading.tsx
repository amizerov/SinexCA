"use client";
import {useState} from "react";
import {X} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {ATOMS,isOpen,orderLabel,type DemoOrder,type OrderType} from "@/lib/paper/orders";
import {paperAmount,paperDecimals,paperOrderStatus} from "@/lib/paper/account";
import {price} from "@/lib/market/format";
import type {TradingPair} from "@/lib/market/types";
import type {useDemoOrders} from "@/hooks/use-demo-orders";
import {OrderDetailsDialog} from "./OrderDetailsDialog";
import {NewOrderDialog} from "./NewOrderDialog";
import {useFloatingNotice} from "@/components/FloatingNotices";
export interface OrderDraft {side:"buy"|"sell";price:number;type:OrderType;usePreferences?:boolean;order?:DemoOrder}
type Orders=ReturnType<typeof useDemoOrders>;
export type OrderDialogProps={pair:TradingPair;draft:OrderDraft;currentPrice?:number;orders:Orders;close:()=>void};
export function DemoOrderDialog(props:OrderDialogProps){return props.draft.order?<OrderDetailsDialog order={props.draft.order} orders={props.orders} close={props.close}/>:<NewOrderDialog {...props}/>;}
export function DemoOrdersPanel({orders,onSelect}:{orders:Orders;onSelect:(order:DemoOrder)=>void}){
  const [expanded,setExpanded]=useState(false),[tab,setTab]=useState("open"),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const all=orders.data?.orders||[],open=all.filter(isOpen),visible=tab==="open"?open:tab==="filled"?all.filter(o=>o.filled>0):all;
  const healthWarning=orders.data?.health.errors.length?`Исполнение ожидает свежих данных: ${orders.data.health.errors.join("; ")}`:undefined;
  useFloatingNotice("demo-orders",error||orders.error);
  useFloatingNotice("demo-orders-health",healthWarning,{tone:"warning"});
  async function cancel(o:DemoOrder){setBusy(o.id);try{await orders.request({action:"cancel",id:o.id});setError("");}catch(e){setError(e instanceof Error?e.message:"Ошибка отмены");}finally{setBusy("");}}
  return <section className={`demo-orders-panel ${expanded?"expanded":""}`} aria-label="Тестовые заявки"><div className="demo-orders-tabs"><button onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} title="Развернуть заявки">{expanded?"▾":"▸"} Заявки</button>{[["open",`Открытые (${open.length})`],["filled","Исполнения"],["history","История"]].map(([key,name])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setExpanded(true);}}>{name}</button>)}</div>
    {expanded&&<div className="demo-orders-scroll">{tab==="filled"?<DemoFillTable orders={orders} onSelect={onSelect}/>:!visible.length?<p className="account-hint">Заявок пока нет</p>:<table><thead><tr><th>Биржа / пара</th><th>Заявка</th><th>Цена / стоп</th><th>Исполнено</th><th>Статус</th><th/></tr></thead><tbody>{visible.map(o=><tr key={o.id} className="order-market-row" tabIndex={0} title={`Открыть ${o.base}/${o.quote} · ${EXCHANGES[o.exchange].name}`} onClick={()=>onSelect(o)} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onSelect(o);}}}><td>{EXCHANGES[o.exchange].name} · {o.base}/{o.quote}</td><td className={o.side==="buy"?"positive":"negative"}>{orderLabel(o)}</td><td>{price(o.limit??undefined)}{o.stop?` / ${price(o.stop)}`:""}</td><td>{price(o.filled/ATOMS)} / {price(o.quantity/ATOMS)}</td><td title={o.note}>{!o.triggered?"Ожидает стоп":paperOrderStatus(o.status)}</td><td>{isOpen(o)&&<button className="button" disabled={!!busy} onClick={event=>{event.stopPropagation();void cancel(o);}} aria-label={`Отменить ${o.id}`}><X size={12}/></button>}</td></tr>)}</tbody></table>}</div>}
  </section>;
}


function DemoFillTable({orders,onSelect}:{orders:Orders;onSelect:(order:DemoOrder)=>void}){
  const fills=orders.data?.fills||[],byId=new Map(orders.data?.orders.map(o=>[o.id,o]));
  if(!fills.length)return <p className="account-hint">Исполнений пока нет</p>;
  return <table><thead><tr><th>Время</th><th>Биржа / пара</th><th>Направление</th><th>Цена</th><th>Количество</th><th>Сумма</th><th>Комиссия</th></tr></thead><tbody>{fills.map(f=>{const o=byId.get(f.orderId);return <tr key={f.id} className={o?"order-market-row":undefined} tabIndex={o?0:undefined} onClick={()=>o&&onSelect(o)} onKeyDown={event=>{if(o&&event.target===event.currentTarget&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onSelect(o);}}}><td>{new Date(f.receivedAt).toLocaleTimeString("ru-RU")}</td><td>{o?EXCHANGES[o.exchange].name+" · "+o.base+"/"+o.quote:"—"}</td><td>{o?.side==="buy"?"Покупка":"Продажа"}</td><td>{price(f.price)}</td><td>{price(f.quantity/ATOMS)} {o?.base}</td><td>{o?paperAmount(f.quoteUnits,paperDecimals(o.quote)):"—"} {o?.quote}</td><td>{o?paperAmount(f.feeUnits,paperDecimals(o.quote)):"—"} {o?.quote}</td></tr>;})}</tbody></table>;
}
