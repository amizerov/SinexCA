"use client";
import {useId,type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {Pin,PinOff,X} from "lucide-react";
import type {TradingPair,StreamStatus} from "@/lib/market/types";
import type {TradeTick} from "@/lib/market/trades/types";
import type {DemoState} from "@/hooks/use-demo-orders";
import {ATOMS} from "@/lib/paper/orders";
import {bookNumber} from "@/lib/market/orderbook/model";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {useFloatingWindow} from "@/hooks/use-floating-window";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {useOrderBookDock} from "@/hooks/use-order-book-dock";
import {usePanelDock} from "./PanelDock";
import {TradesPlacementMenu} from "./TradesPlacementMenu";
import type {TradeConnection} from "@/lib/market/trades/stream";
import {useClientReady} from "@/hooks/use-client-ready";
const timeFormat=new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const dateFormat=new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"medium"});
export function TradesPanel({pair,trades,status,connection,demo,error,inColumn=false,pending=false}:{pair:TradingPair;trades:TradeTick[];status:StreamStatus;connection?:TradeConnection;demo?:DemoState;error?:string;inColumn?:boolean;pending?:boolean}){
  const preferences=useWorkspacePreferences(),settings=preferences.settings,window=useFloatingWindow("trades"),title=useId(),tabs=useId(),panel=useId();
  const clientReady=useClientReady();
  const dock=useOrderBookDock(settings.tradesWidth,width=>preferences.update({tradesWidth:width}),260,480),docked=settings.tradesDocked&&dock.wide;
  const placement=usePanelDock();
  const side=settings.tradesSide==="auto"?(settings.marketPanel.mode==="left"?"left":"right"):settings.tradesSide;
  const mine=settings.tradesTab==="mine",close=()=>preferences.update({tradesOpen:false});
  const byOrder=new Map(demo?.orders.map(o=>[o.id,o]));
  const own=demo?.fills.filter(f=>{const o=byOrder.get(f.orderId);return (f.exchange??o?.exchange)===pair.exchange&&(f.symbol??o?.symbol)===pair.symbol;}).map(f=>({id:f.id,price:f.price,quantity:f.quantity/ATOMS,time:f.receivedAt,side:f.side??byOrder.get(f.orderId)?.side}))||[];
  const rows=mine?own:trades.map((t,i)=>({...t,id:t.id??`${t.time}:${t.receivedAt}:${i}`}));
  const live=status==="live",context=`${EXCHANGES[pair.exchange].name} · ${pair.baseAsset}/${pair.quoteAsset}`;
  const quiet=!!connection?.connected&&!!connection.subscribed&&!live;
  const statusText=mine?"Мои тестовые исполнения":live?"Сделки WebSocket":quiet?"WebSocket подключён, новых сделок нет":status==="connecting"||status==="reconnecting"?"Подключение к потоку сделок":"Поток сделок недоступен";
  function keys(event:KeyboardEvent<HTMLElement>){if(event.key==="Escape"){event.stopPropagation();close();}}
  const content=<section data-dock-panel="trades" className={`trades-window ${docked?"trades-docked":""}`} role="dialog" aria-modal="false" aria-labelledby={title} tabIndex={-1}
    style={docked?{width:dock.width}:{left:window.layout.x,top:window.layout.y,width:window.layout.width,height:window.layout.height}}
    onPointerMove={!docked?window.move:undefined} onPointerUp={!docked?window.end:undefined} onPointerCancel={!docked?window.end:undefined} onLostPointerCapture={!docked?window.end:undefined} onKeyDown={keys}>
    <header className="orderbook-window-header" tabIndex={0} aria-label={docked?"Закреплённые сделки":"Переместить сделки"} title={`${context} · Перетащите окно за шапку для перемещения и закрепления`} onPointerDown={e=>placement.start("trades",e)} onKeyDown={!docked?e=>window.key(e):undefined}>
      <h2 id={title}>Сделки <small>{pair.baseAsset}</small></h2><span className={`trades-status ${!mine&&!live&&!quiet?"waiting":""}`} role="status" title={`${context} · ${statusText}`} aria-label={statusText}>{mine?<b>DEMO</b>:<span className="status-dot"/>}</span>
      <button disabled={!dock.wide} onClick={()=>placement.place("trades",docked?"floating":side)} aria-label={docked?"Открепить сделки":"Закрепить сделки"} title={docked?"Открепить окно":"Закрепить в колонке с рынками"}>{docked?<PinOff size={13}/>:<Pin size={13}/>}</button>
      <TradesPlacementMenu/>
      <button onClick={close} aria-label="Закрыть сделки"><X size={15}/></button>
    </header>
    <div className="trades-tabs" role="tablist" aria-label="Источник сделок" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?"all":e.key==="End"?"mine":mine?"all":"mine";preferences.update({tradesTab:next});e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();}}>{(["all","mine"] as const).map(tab=><button key={tab} id={`${tabs}-${tab}`} data-tab={tab} role="tab" aria-selected={settings.tradesTab===tab} aria-controls={panel} tabIndex={settings.tradesTab===tab?0:-1} onClick={()=>preferences.update({tradesTab:tab})}>{tab==="all"?"Все":"Мои"}</button>)}<span title={context}>{EXCHANGES[pair.exchange].name} · {pair.quoteAsset}</span></div>
    <div className="trades-content" role="tabpanel" id={panel} aria-labelledby={`${tabs}-${settings.tradesTab}`}>
      {mine&&error&&<p className="book-error" role="alert">{error}</p>}
      {!mine&&!live&&<p className="trades-notice" role="status">{quiet?"Новых сделок пока нет":status==="connecting"||status==="reconnecting"?"Подключение…":"Нет свежего потока сделок"}</p>}
      <div className="trades-columns" aria-hidden="true"><span>Цена <small>{pair.quoteAsset}</small></span><span>Кол-во <small>{pair.baseAsset}</small></span><span>Время</span></div>
      <div className="trades-scroll" role="table" aria-label={mine?"Мои тестовые сделки":"Рыночные сделки"}>
        {rows.map((t,i)=><div role="row" className="trade-tape-row" key={`${t.id}:${i}`} title={`${t.side==="buy"?"Покупка":t.side==="sell"?"Продажа":"Направление не указано"} · ${dateFormat.format(t.time)}${mine?" · DEMO":""}`}>
          <span role="cell" className={t.side==="buy"?"positive":t.side==="sell"?"negative":""}>{bookNumber(t.price)}</span><span role="cell">{t.quantity===undefined?"—":bookNumber(t.quantity)}</span><time role="cell" dateTime={new Date(t.time).toISOString()}>{timeFormat.format(t.time)}</time>
        </div>)}
        {!rows.length&&<p className="trades-empty">{pending?"Загружаем пару…":mine?"Ваших тестовых исполнений по этой паре пока нет":"Ожидаем сделки выбранной пары…"}</p>}
      </div>
    </div>
    {docked?!inColumn&&<div className="trades-dock-resize" role="separator" tabIndex={0} aria-label="Ширина сделок" aria-orientation="vertical" aria-valuenow={dock.width} aria-valuemin={260} aria-valuemax={480} onPointerDown={dock.start} onPointerMove={e=>dock.move(e,true)} onPointerUp={dock.end} onPointerCancel={dock.end} onKeyDown={e=>dock.key(e,true)}/>
    :(["n","s","e","w","ne","nw","se","sw"] as const).map(edge=><div key={edge} className={`book-resize book-resize-${edge}`} onPointerDown={e=>window.start(e,edge)} {...edge==="se"?{role:"button",tabIndex:0,"aria-label":"Изменить размер сделок",onKeyDown:(e:KeyboardEvent<HTMLElement>)=>window.key(e,true)}:{"aria-hidden":true}}/>)}
  </section>;
  return docked?content:clientReady?createPortal(content,document.body):null;
}
