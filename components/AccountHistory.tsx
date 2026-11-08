"use client";
import {useState} from "react";
import {RefreshCw} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import type {ExchangeId} from "@/lib/market/types";
import {paperAmount,paperDecimals,paperOperationName,paperOrderStatus,type PaperAccountSnapshot,type PaperOrder} from "@/lib/paper/account";
const date=(value:number)=>new Date(value).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
const price=(value:number)=>new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:12}).format(value);
const venue=(id:string)=>EXCHANGES[id as ExchangeId]?.name||id;
const active=(o:PaperOrder)=>["pending","open","partially_filled"].includes(o.status);
type Tab="open"|"closed"|"orders"|"fills"|"deposits";
export function AccountHistory({snapshot,loading,page,setPage,refresh}:{snapshot:PaperAccountSnapshot;loading:boolean;page:number;setPage:(page:number)=>void;refresh:()=>void}){
  const [tab,setTab]=useState<Tab>("open");
  const open=snapshot.openOrders??snapshot.orders.filter(active),closedCount=snapshot.orderCount-snapshot.openOrderCount;
  const deposits=snapshot.deposits??snapshot.operations.filter(o=>["deposit","transfer_in"].includes(o.kind));
  const rows=tab==="open"?open:tab==="closed"?snapshot.closedOrders??snapshot.orders.filter(o=>!active(o)):snapshot.orders;
  const tabs:[Tab,string,number][]=[["open","Открытые",snapshot.openOrderCount],["closed","Закрытые",closedCount],["orders","История заявок",snapshot.orderCount],["fills","Сделки",snapshot.fillCount],["deposits","Пополнения",snapshot.depositCount]];
  const total=tabs.find(([key])=>key===tab)![2],shown=tab==="fills"?(snapshot.fills?.length??0):rows.length,paged=["closed","orders","fills"].includes(tab);
  function select(next:Tab){setTab(next);setPage(0);}
  return <>
    <section className="paper-reserves" aria-label="Зарезервировано заявками"><div><h3>Зарезервировано заявками</h3><p>{snapshot.openOrderCount} открытых · {closedCount} закрытых · {snapshot.fillCount} сделок</p></div><div className="paper-reserve-values">{snapshot.balances.filter(b=>b.reservedUnits>0).map(b=><strong key={b.currency}>{paperAmount(b.reservedUnits,b.decimals)} <span>{b.currency}</span></strong>)}{!snapshot.balances.some(b=>b.reservedUnits>0)&&<span>Нет зарезервированных средств</span>}</div></section>
    <section className="paper-history" aria-label="Заявки и сделки">
      <div className="paper-history-title"><h3>Заявки и сделки</h3><button type="button" className="button" onClick={refresh} disabled={loading} aria-label="Обновить тестовый счёт"><RefreshCw size={12}/></button></div>
      <div className="paper-history-tabs" role="tablist" aria-label="История счёта" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const index=tabs.findIndex(([key])=>key===tab),next=tabs[e.key==="Home"?0:e.key==="End"?tabs.length-1:(index+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length][0];select(next);e.currentTarget.querySelector<HTMLButtonElement>(`[data-history="${next}"]`)?.focus();}}>
        {tabs.map(([key,label,count])=><button key={key} type="button" id={`paper-${key}-tab`} data-history={key} role="tab" aria-controls={`paper-${key}-panel`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>select(key)}>{label} <span>{count}</span></button>)}
      </div>
      <div role="tabpanel" id={`paper-${tab}-panel`} aria-labelledby={`paper-${tab}-tab`} aria-busy={loading}>
        {tab==="deposits"?<>{deposits.length?<div className="paper-table-wrap"><table><thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th><th>Баланс после</th></tr></thead><tbody>{deposits.map(o=><tr key={o.id}><td>{date(o.createdAt)}</td><td>{paperOperationName(o.kind)}</td><td className="positive">+{paperAmount(o.availableDelta,o.decimals)} {o.currency}</td><td>{paperAmount(o.availableAfter,o.decimals)} {o.currency}</td></tr>)}</tbody></table></div>:<p className="paper-empty">Пополнений пока нет.</p>}{snapshot.depositCount>deposits.length&&<p className="account-hint">Последние {deposits.length} из {snapshot.depositCount} пополнений</p>}</>:
        tab==="fills"?<>{snapshot.fills?.length?<div className="paper-table-wrap"><table className="paper-orders-table"><thead><tr><th>Дата</th><th>Пара / биржа</th><th>Направление</th><th>Цена</th><th>Количество</th><th>Сумма</th><th>Комиссия</th><th>Заявка</th></tr></thead><tbody>{snapshot.fills.map(f=><tr key={f.id}><td>{date(f.createdAt)}</td><td><strong>{f.base}/{f.quote}</strong><small>{venue(f.exchange)}</small></td><td className={f.side==="buy"?"positive":"negative"}>{f.side==="buy"?"Покупка":"Продажа"}</td><td>{price(f.price)} {f.quote}</td><td>{paperAmount(f.quantityAtoms,8)} {f.base}</td><td>{paperAmount(f.settlementUnits,paperDecimals(f.settlementCurrency))} {f.settlementCurrency}</td><td>{paperAmount(f.feeUnits,paperDecimals(f.settlementCurrency))} {f.settlementCurrency}</td><td title={f.orderId}>{f.orderId.slice(0,8)}</td></tr>)}</tbody></table></div>:<p className="paper-empty">Исполненных сделок пока нет.</p>}</>:
        <>{rows.length?<div className="paper-table-wrap"><table className="paper-orders-table"><thead><tr><th>Создана</th><th>Пара / биржа</th><th>Направление</th><th>Тип / цена</th><th>Исполнено / количество</th><th>Резерв</th><th>Статус</th><th>Обновлена</th></tr></thead><tbody>{rows.map(o=><tr key={o.id}><td title={o.id}>{date(o.createdAt)}</td><td><strong>{o.base&&o.quote?`${o.base}/${o.quote}`:o.symbol}</strong><small>{venue(o.exchange)}</small></td><td className={o.side==="buy"?"positive":"negative"}>{o.side==="buy"?"Покупка":"Продажа"}</td><td>{({limit:"Лимит",market:"Маркет",stop_limit:"Стоп-лимит",stop_market:"Стоп-маркет"} as Record<string,string>)[o.orderType]||o.orderType}{o.limitPrice!=null&&<small>{price(o.limitPrice)} {o.quote}</small>}{o.stopPrice!=null&&<small>Стоп {price(o.stopPrice)} {o.quote}</small>}</td><td>{paperAmount(o.filledAtoms,8)} / {paperAmount(o.quantityAtoms,8)} {o.base}</td><td>{o.reservedUnits!=null&&o.reservedCurrency?`${paperAmount(o.reservedUnits,paperDecimals(o.reservedCurrency))} ${o.reservedCurrency}`:"—"}</td><td>{active(o)&&o.triggered===false?"Ожидает стоп-цены":paperOrderStatus(o.status)}</td><td>{o.updatedAt?date(o.updatedAt):"—"}</td></tr>)}</tbody></table></div>:<p className="paper-empty">{tab==="open"?"Открытых заявок нет.":tab==="closed"?"Закрытых заявок пока нет.":"Заявок пока нет."}</p>}</>}
        {paged&&total>0&&<div className="paper-history-pages"><button className="button" disabled={!page||loading} onClick={()=>setPage(page-1)}>Назад</button><span>{page*50+1}–{page*50+shown} из {total}</span><button className="button" disabled={(page+1)*50>=total||loading} onClick={()=>setPage(page+1)}>Далее</button></div>}
      </div>
    </section>
  </>;
}
