"use client";
import {useRef,useState} from "react";
import {createPortal} from "react-dom";
import Link from "next/link";
import {X} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {ATOMS,isOpen,orderLabel,orderNames,type DemoOrder,type OrderType} from "@/lib/paper/orders";
import {paperAmount,paperDecimals,paperOrderStatus} from "@/lib/paper/account";
import {price} from "@/lib/market/format";
import type {TradingPair} from "@/lib/market/types";
import type {useDemoOrders} from "@/hooks/use-demo-orders";
import {useOrderBook} from "@/hooks/use-order-book";
import {OrderDetailsDialog} from "./OrderDetailsDialog";
import {useDraggableDialog} from "@/hooks/use-draggable-dialog";
import {useFloatingNotice} from "@/components/FloatingNotices";
export interface OrderDraft {side:"buy"|"sell";price:number;type:OrderType;order?:DemoOrder}
type Orders=ReturnType<typeof useDemoOrders>;
type DialogProps={pair:TradingPair;draft:OrderDraft;currentPrice?:number;orders:Orders;close:()=>void};
export function DemoOrderDialog(props:DialogProps){return props.draft.order?<OrderDetailsDialog order={props.draft.order} orders={props.orders} close={props.close}/>:<NewOrderDialog {...props}/>;}
function NewOrderDialog({pair,draft,currentPrice,orders,close}:DialogProps){
  const defaultLimit=(side:"buy"|"sell")=>String(Number(((currentPrice??draft.price)*(side==="buy"?0.99:1.01)).toPrecision(12)));
  const dialog=useRef<HTMLDialogElement>(null),[side,setSide]=useState(draft.side),[type,setType]=useState<OrderType>(draft.type),[limit,setLimit]=useState(defaultLimit(draft.side)),[stop,setStop]=useState(String(draft.price)),[quantity,setQuantity]=useState(""),[slippage,setSlippage]=useState("1"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),mutation=useRef({body:"",id:""});
  const floating=useDraggableDialog(dialog,"order");
  function closeWindow(){floating.remember();close();}
  const market=type.endsWith("market"),stopped=type.startsWith("stop"),source=useOrderBook(pair),book=source.book;
  useFloatingNotice(`demo-order:${pair.exchange}:${pair.symbol}`,error||source.error);
  const best=(side==="buy"?book?.asks[0]?.price:book?.bids[0]?.price)??draft.price,rate=market?best:Number(limit),balances=orders.data?.account.balances||[],currency=side==="buy"?pair.quoteAsset:pair.baseAsset,balance=balances.find(b=>b.currency===currency),portfolio=orders.data?.account.portfolio;
  const venueUnits=portfolio?(portfolio.venueBalances.find(b=>b.exchange===pair.exchange&&b.currency===currency)?.availableUnits||0)+(portfolio.unassigned.find(b=>b.currency===currency)?.availableUnits||0):balance?.availableUnits||0;
  const available=venueUnits/10**paperDecimals(currency);
  const requested=Number(quantity),estimated=requested>0?requested*rate:undefined;
  let remaining=Number(quantity),notional=0,taken=0;
  for(const level of (side==="buy"?book?.asks:book?.bids)||[]){if(!remaining||!Number.isFinite(remaining))break;const bound=market?best*(1+(side==="buy"?1:-1)*Number(slippage)/100):Number(limit);if(side==="buy"?level.price>bound:level.price<bound)break;const q=Math.min(remaining,level.quantity);taken+=q;notional+=q*level.price;remaining-=q;}
  async function submit(e:React.FormEvent){e.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");try{
    const body={exchange:pair.exchange,symbol:pair.symbol,side,type,quantity,...!market?{limit:Number(limit)}:{},...stopped?{stop:Number(stop)}:{},slippage:Number(slippage)};
    const key=JSON.stringify(body);if(mutation.current.body!==key)mutation.current={body:key,id:crypto.randomUUID()};
    const input={...body,mutationId:mutation.current.id};await orders.request(input);closeWindow();
  }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заявку");}finally{inFlight.current=false;setBusy(false);}}
  const bookPrice=!source.stale?(requested>0&&taken>0?notional/taken:side==="buy"?book?.asks[0]?.price:book?.bids[0]?.price):undefined;
  return createPortal(<dialog ref={dialog} className="account-dialog demo-order-dialog" aria-modal="false" aria-labelledby="demo-order-title" style={{left:floating.position.x,top:floating.position.y}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(!busy)closeWindow();}}}>
    <header className="demo-order-heading" tabIndex={0} aria-label="Переместить заявку" onPointerDown={floating.start} onPointerMove={floating.move} onPointerUp={floating.end} onPointerCancel={floating.end} onLostPointerCapture={floating.end} onKeyDown={floating.key}>
      <div><h2 id="demo-order-title">Тестовая заявка</h2><p className="demo-instrument"><b>DEMO</b> {pair.baseAsset}/{pair.quoteAsset} · {EXCHANGES[pair.exchange].name}</p></div><button disabled={busy} onClick={closeWindow} aria-label="Закрыть заявку"><X size={17}/></button>
    </header>
    <form className="demo-order-body" onSubmit={submit}><fieldset disabled={busy}>
      <div className="demo-sides">{(["buy","sell"] as const).map(s=><button type="button" key={s} aria-pressed={s===side} className={s===side?s==="buy"?"positive":"negative":""} onClick={()=>{if(s===side)return;setSide(s);setLimit(defaultLimit(s));}}>{s==="buy"?"Покупка":"Продажа"}</button>)}</div>
      <select aria-label="Тип заявки" value={type} onChange={e=>setType(e.target.value as OrderType)}>{Object.entries(orderNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
      <p className="account-hint">{type==="limit"?"Исполнение по лимитной цене или выгоднее.":type==="market"?"Исполнение по доступным встречным заявкам стакана.":type==="stop_limit"?"После достижения стоп-цены активируется лимитная заявка.":"После достижения стоп-цены активируется рыночная заявка с защитой цены."}</p>
      {stopped&&<label>Стоп-цена, {pair.quoteAsset}<input required type="number" step="any" min="0.000000000001" value={stop} onChange={e=>setStop(e.target.value)}/></label>}
      {!market&&<label>Лимитная цена, {pair.quoteAsset}<input required type="number" step="any" min="0.000000000001" value={limit} onChange={e=>setLimit(e.target.value)}/></label>}
      <label>Количество, {pair.baseAsset}<input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,8})?" value={quantity} onChange={e=>setQuantity(e.target.value.replace(",","."))}/></label>
      <div className="paper-presets">{[25,50,75,100].map(n=><button type="button" key={n} onClick={()=>{const p=market?(type==="stop_market"?Number(stop):best)*(1+Number(slippage)/100):rate;setQuantity((Math.floor((side==="buy"?available/(p*1.001):available)*n/100*10**paperDecimals(pair.baseAsset))/10**paperDecimals(pair.baseAsset)).toFixed(paperDecimals(pair.baseAsset)));}}>{n}%</button>)}</div>
      {market&&<label>Защита цены, %<input required type="number" min="0.1" max="10" step="0.1" value={slippage} onChange={e=>setSlippage(e.target.value)}/></label>}
      <div className="demo-estimate"><span>Доступно</span><strong>{paperAmount(Math.round(available*10**paperDecimals(currency)),paperDecimals(currency))} {currency}</strong><span>Сумма ≈</span><strong>{price(estimated)} {pair.quoteAsset}</strong><span>DEMO-комиссия</span><strong>0,1% · {pair.quoteAsset}</strong>{!stopped&&<><span title="Расчёт по текущим встречным заявкам; исполнение лимитной заявки может произойти позднее">{requested>0&&taken>0?"Средняя цена ≈":"Лучшая цена"}</span><strong data-order-book-price>{price(bookPrice)} {pair.quoteAsset}</strong></>}</div>
      {market&&<p className="account-hint">{type==="stop_market"?"Защита отсчитывается от стоп-цены.":"Защита отсчитывается от лучшей цены стакана на сервере при создании."} Остаток за пределами защиты или глубины отменяется.</p>}
      <p className="account-hint"><Link href="/account">Пополнить счёт</Link></p>
      <button type="submit" className="account-submit" disabled={!orders.data}>{busy?"Сохраняем…":"Создать заявку"}</button>
    </fieldset></form>
  </dialog>,document.body);
}
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
