"use client";
import {useEffect,useId,useRef,useState,useMemo,type CSSProperties,type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {X,Pin,PinOff,MoreHorizontal} from "lucide-react";
import type {TradingPair} from "@/lib/market/types";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {bookNumber,bookSpread} from "@/lib/market/orderbook/model";
import {displayBookLevels,bookAmount,bookNotional,type DisplayBookLevel} from "@/lib/market/orderbook/display";
import type {OrderBookSettings} from "@/lib/market/orderbook/settings";
import {useOrderBook} from "@/hooks/use-order-book";
import {useFloatingWindow} from "@/hooks/use-floating-window";
import {useOrderBookDock} from "@/hooks/use-order-book-dock";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {useClientReady} from "@/hooks/use-client-ready";

export function OrderBookDialog({pair,lastPrice,close,pending=false}:{pair:TradingPair;lastPrice?:number;close:()=>void;pending?:boolean}){
  const root=useRef<HTMLElement>(null),menu=useRef<HTMLDivElement>(null),menuButton=useRef<HTMLButtonElement>(null);
  const clientReady=useClientReady();
  const titleId=useId(),contextId=useId(),menuId=useId();
  const {book,error,mode,stale,refresh}=useOrderBook(pair,!pending),floating=useFloatingWindow(),preferences=useWorkspacePreferences();
  const settings=preferences.settings.orderBookSettings;
  const marketKey=`${pair.exchange}:${pair.marketType}:${pair.symbol}`,priceStep=settings.priceSteps[marketKey]??settings.priceSteps["legacy:default"]??0;
  const save=(patch:Partial<OrderBookSettings>)=>preferences.update({orderBookSettings:{...settings,...patch}});
  const dock=useOrderBookDock(settings.width,width=>save({width})),docked=settings.mode==="docked"&&dock.wide;
  const [menuPosition,setMenuPosition]=useState<{left:number;top:number}|null>(null);
  useEffect(()=>{root.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{
    if(!menuPosition)return;
    const outside=(event:globalThis.PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!menuButton.current?.contains(event.target as Node))setMenuPosition(null);};
    const resize=()=>setMenuPosition(null);
    document.addEventListener("pointerdown",outside);window.addEventListener("resize",resize);
    return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",resize);};
  },[menuPosition]);
  const bids=book?.bids||[],asks=book?.asks||[],spread=book?bookSpread(book):null;
  const display=useMemo(()=>({
    bids:displayBookLevels(book?.bids||[],false,priceStep,settings.levels),
    asks:displayBookLevels(book?.asks||[],true,priceStep,settings.levels),
  }),[book,priceStep,settings.levels]);
  const totalBids=bids.reduce((sum,row)=>sum+row.quantity,0),totalAsks=asks.reduce((sum,row)=>sum+row.quantity,0);
  const maximumTotal=Math.max(totalBids,totalAsks,Number.MIN_VALUE);
  const depth=(row:DisplayBookLevel)=>settings.bars==="cumulative"?row.cumulativeQuantity:row.quantity;
  const visibleDepth=settings.side==="buy"?display.bids:settings.side==="sell"?display.asks:[...display.bids,...display.asks];
  const maximum=Math.max(...visibleDepth.map(depth),Number.MIN_VALUE);
  const context=`${EXCHANGES[pair.exchange].name} · ${pair.baseAsset}/${pair.quoteAsset}`;
  const status=stale?"Данные устарели":error?error:!book?"Подключение…":mode==="ws"?"WebSocket":"REST · 1с";
  function toggleMenu(){
    if(menuPosition){setMenuPosition(null);return;}
    const rect=menuButton.current!.getBoundingClientRect(),height=Math.min(390,window.innerHeight-16);
    setMenuPosition({left:Math.max(8,Math.min(rect.right-244,window.innerWidth-252)),top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8))});
  }
  function escape(event:KeyboardEvent<HTMLElement>){if(event.key==="Escape"){event.stopPropagation();if(menuPosition){setMenuPosition(null);menuButton.current?.focus();}else close();}}
  const renderSide=(side:DisplayBookLevel[],sell:boolean)=><div className={`book-side ${sell?"book-asks":"book-bids"}`} role="rowgroup" aria-label={sell?"Продажи":"Покупки"}>
    {(sell?[...side].reverse():side).map(row=><div key={row.price} role="row" className="book-row" style={{"--depth":`${depth(row)/maximum*100}%`} as CSSProperties}
      title={`${sell?"Продажа":"Покупка"}: ${bookAmount(row.quantity)} ${pair.baseAsset} · сумма ${bookAmount(row.notional)} ${pair.quoteAsset} · накоплено ${bookAmount(row.cumulativeQuantity)} ${pair.baseAsset}`}>
      <span role="cell" className="book-price">{bookNumber(row.price)}</span>
      <span role="cell" className="book-quantity">{bookAmount(row.quantity)}</span>
      <span role="cell" className="book-notional">{bookNotional(row.notional,pair.quoteAsset)}</span>
    </div>)}
    {!side.length&&book&&<p className="book-empty">{sell?"Нет продаж":"Нет покупок"}</p>}
  </div>;
  const content=<section ref={root} role="dialog" aria-modal="false" tabIndex={-1} className={`orderbook-window book-terminal ${docked?"orderbook-docked":""}`}
    aria-labelledby={titleId} aria-describedby={contextId}
    style={docked?{width:dock.width}:{left:floating.layout.x,top:floating.layout.y,width:floating.layout.width,height:floating.layout.height}}
    onPointerMove={!docked?floating.move:undefined} onPointerUp={!docked?floating.end:undefined} onPointerCancel={!docked?floating.end:undefined} onLostPointerCapture={!docked?floating.end:undefined} onKeyDown={escape}>
    <header className="orderbook-window-header" tabIndex={0} aria-label={docked?"Закреплённый стакан":"Переместить стакан"}
      title={`${context} · ${docked?"Слева от графика":"Перетащите за шапку; стрелки — перемещение"}`}
      onPointerDown={!docked?event=>floating.start(event):undefined} onKeyDown={!docked?event=>floating.key(event):undefined}>
      <h2 id={titleId}>Стакан {pair.baseAsset}</h2>
      <span className={`book-window-time ${stale||error||!book?"waiting":""}`} role="status" aria-label={status} title={`${context} · ${status}`}><span className="status-dot"/>{book?<time dateTime={new Date(book.receivedAt).toISOString()}>{new Date(book.receivedAt).toLocaleTimeString("ru-RU")}</time>:<span>—</span>}</span>
      <button type="button" disabled={!dock.wide} onClick={()=>save({mode:docked?"floating":"docked"})} aria-label={docked?"Открепить стакан":"Закрепить стакан"} title={!dock.wide?"Закрепление доступно при ширине экрана от 1100px":docked?"Открыть плавающее окно":"Закрепить слева от графика"}>{docked?<PinOff size={13}/>:<Pin size={13}/>}</button>
      <button ref={menuButton} type="button" onClick={toggleMenu} aria-label="Настройки стакана" aria-expanded={!!menuPosition} aria-controls={menuId}><MoreHorizontal size={15}/></button>
      <button type="button" onClick={close} aria-label="Закрыть стакан"><X size={15}/></button>
    </header>
    <p id={contextId} className="sr-only">{context}. Цена, количество в {pair.baseAsset}, сумма в {pair.quoteAsset}. Суммы относятся к загруженной глубине.</p>
    {error&&<div className="book-error" role="alert">{error}<button type="button" onClick={refresh}>Повторить</button></div>}
    {stale&&!error&&<p className="book-stale-warning" role="status">Данные устарели</p>}
    <div className={`book-table ${stale?"book-stale":""}`} role="table" aria-label={`Заявки ${pair.baseAsset}/${pair.quoteAsset}`} aria-busy={!book&&!error}>
      <div className="book-row book-columns" role="row">
        <span role="columnheader" title={`Цена в ${pair.quoteAsset}${priceStep?" · сгруппированные уровни":""}`}>Цена <small>{pair.quoteAsset}</small></span>
        <span role="columnheader">Кол-во <small>{pair.baseAsset}</small></span>
        <span role="columnheader">Сумма <small>{pair.quoteAsset}</small></span>
      </div>
      <div className="book-depth-scroll" data-side={settings.side}>{!book?<p className="book-empty">{error?"Нет данных":"Загрузка заявок…"}</p>:<>
        {settings.side!=="buy"&&renderSide(display.asks,true)}
        <div className="book-spread">
          <span className="book-total-buy" style={{"--depth":`${totalBids/maximumTotal*100}%`} as CSSProperties} data-book-total="buy" title={`Покупки: ${bookAmount(totalBids)} ${pair.baseAsset} по ${bids.length} загруженным уровням`}>Σ {bookAmount(totalBids)} <small>{pair.baseAsset}</small></span>
          <span className="book-spread-value"><strong className="book-last-price" title={`Последняя цена · ${pair.quoteAsset}`}>{lastPrice!==undefined?bookNumber(lastPrice):"—"}</strong><span title={spread?`Спред ${bookNumber(spread.value)} ${pair.quoteAsset} · ${bookAmount(spread.percent)}%`:"Спред недоступен"}>Спред {spread?bookNumber(spread.value):"—"}</span></span>
          <span className="book-total-sell" style={{"--depth":`${totalAsks/maximumTotal*100}%`} as CSSProperties} data-book-total="sell" title={`Продажи: ${bookAmount(totalAsks)} ${pair.baseAsset} по ${asks.length} загруженным уровням`}>Σ {bookAmount(totalAsks)} <small>{pair.baseAsset}</small></span>
        </div>
        {settings.side!=="sell"&&renderSide(display.bids,false)}
      </>}</div>
    </div>
    {docked?<div className="book-dock-resize" role="separator" tabIndex={0} aria-label="Ширина стакана" aria-orientation="vertical" aria-valuenow={dock.width} aria-valuemin={230} aria-valuemax={560}
      onPointerDown={dock.start} onPointerMove={dock.move} onPointerUp={dock.end} onPointerCancel={dock.end} onLostPointerCapture={dock.end} onKeyDown={dock.key}/>
      :(["n","s","e","w","ne","nw","se","sw"] as const).map(edge=><div key={edge} className={`book-resize book-resize-${edge}`} onPointerDown={event=>floating.start(event,edge)} {...(edge==="se"?{role:"button",tabIndex:0,"aria-label":"Изменить размер стакана",title:"Потяните за край; стрелки — изменение размера",onKeyDown:(event:KeyboardEvent<HTMLElement>)=>floating.key(event,true)}:{"aria-hidden":true})}/>)}
  </section>;
  const menuContent=clientReady&&menuPosition&&createPortal(<div ref={menu} id={menuId} className="book-settings-panel" role="region" aria-label="Настройки стакана" style={menuPosition} onKeyDown={escape}>
    <div className="book-settings-title">Стакан <button type="button" aria-label="Закрыть настройки стакана" onClick={()=>{setMenuPosition(null);menuButton.current?.focus();}}><X size={14}/></button></div>
    <label>Расположение<select aria-label="Расположение стакана" value={settings.mode} onChange={event=>save({mode:event.target.value as OrderBookSettings["mode"]})}><option value="docked" disabled={!dock.wide}>Слева от графика</option><option value="floating">Плавающее окно</option></select></label>
    {!dock.wide&&<p>На узком экране стакан открывается поверх графика.</p>}
    <label>Показать<select aria-label="Стороны стакана" value={settings.side} onChange={event=>save({side:event.target.value as OrderBookSettings["side"]})}><option value="both">Покупки и продажи</option><option value="buy">Только покупки</option><option value="sell">Только продажи</option></select></label>
    <label>Полосы объёма<select aria-label="Полосы объёма" value={settings.bars} onChange={event=>save({bars:event.target.value as OrderBookSettings["bars"]})}><option value="level">На каждом уровне</option><option value="cumulative">Накопленный объём</option></select></label>
    <label>Строк на сторону<select aria-label="Строк на сторону" value={settings.levels} onChange={event=>save({levels:Number(event.target.value) as OrderBookSettings["levels"]})}><option value={5}>До 5</option><option value={10} disabled={!!book&&Math.max(bids.length,asks.length)<10}>До 10</option><option value={20}>Все полученные</option></select></label>
    <label>Шаг группировки, {pair.quoteAsset}<input aria-label="Шаг группировки цены" type="number" min="0" max="1000000000000" step="any" defaultValue={priceStep||""} placeholder="Без группировки" onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=1e12)save({priceSteps:{...settings.priceSteps,[marketKey]:value}});}} onBlur={event=>{event.currentTarget.value=priceStep?String(priceStep):"";}}/></label>
  </div>,document.body);
  return <>{docked?content:clientReady?createPortal(content,document.body):null}{menuContent}</>;
}
