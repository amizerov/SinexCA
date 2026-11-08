"use client";
import {useCallback,useEffect,useId,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {ArrowUpDown,Search,X,Pin,PinOff,MoreHorizontal,Star} from "lucide-react";
import type {TradingPair,Ticker,ExchangeId} from "@/lib/market/types";
import type {TradeTick} from "@/lib/market/trades/types";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {favoriteKey,type MarketPanelSettings} from "@/lib/ui/market-panel-settings";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {useFloatingWindow} from "@/hooks/use-floating-window";
import {useOrderBookDock as useDockWidth} from "@/hooks/use-order-book-dock";
import {PairRow} from "./PairRow";
import {usePanelDock} from "./PanelDock";
interface Props {
  exchange:ExchangeId;pairs:TradingPair[];total?:number;selected?:string;tickers:Map<string,Ticker>;ticks?:Map<string,TradeTick>;
  search:string;setSearch:(value:string)=>void;quote:string;currencies:string[];catalogReady:boolean;setQuote:(quote:string)=>void;
  sort:"volume"|"change"|"name";setSort:(value:"volume"|"change"|"name")=>void;statsReady:boolean;volumeAvailable:boolean;changeAvailable:boolean;
  loading:boolean;error?:string;refresh:()=>void;select:(pair:TradingPair)=>void;inColumn?:boolean;
}
export function MarketsPanel(props:Props){
  const {exchange,pairs,total,selected,tickers,ticks,search,setSearch,quote,currencies,catalogReady,setQuote,sort,setSort,statsReady,volumeAvailable,changeAvailable,loading,error,refresh,select}=props;
  const preferences=useWorkspacePreferences(),settings=preferences.settings.marketPanel,floating=useFloatingWindow("markets");
  const update=preferences.update,dock=usePanelDock();
  const save=(patch:Partial<MarketPanelSettings>)=>update({marketPanel:{...settings,...patch}});
  const width=useDockWidth(settings.width,value=>save({width:value}),280,480),isFloating=settings.mode==="floating",right=settings.mode==="right";
  const titleId=useId(),root=useRef<HTMLElement>(null),menu=useRef<HTMLDivElement>(null),menuButton=useRef<HTMLButtonElement>(null),[menuPosition,setMenuPosition]=useState<{left:number;top:number}|null>(null);
  useEffect(()=>{if(isFloating)root.current?.focus({preventScroll:true});},[isFloating]);
  const favorites=useMemo(()=>new Set(settings.favorites),[settings.favorites]);
  const toggleFavorite=useCallback((pair:TradingPair)=>{const key=favoriteKey(pair),next=new Set(settings.favorites);if(next.has(key))next.delete(key);else next.add(key);update({marketPanel:{...settings,favorites:[...next]}});},[update,settings]);
  const visible=useMemo(()=>settings.favoritesOnly?pairs.filter(pair=>favorites.has(favoriteKey(pair))):pairs,[pairs,settings.favoritesOnly,favorites]);
  const close=()=>preferences.update({marketsOpen:false});
  function escape(event:KeyboardEvent<HTMLElement>){if(event.key!=="Escape")return;event.stopPropagation();if(menuPosition){setMenuPosition(null);menuButton.current?.focus();}else if(isFloating)close();}
  function openMenu(){if(menuPosition){setMenuPosition(null);return;}const rect=menuButton.current!.getBoundingClientRect();setMenuPosition({left:Math.max(8,Math.min(rect.right-216,window.innerWidth-224)),top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-170))});}
  useEffect(()=>{if(!menuPosition)return;menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!menuButton.current?.contains(event.target as Node))setMenuPosition(null);};const resize=()=>setMenuPosition(null);document.addEventListener("pointerdown",outside);window.addEventListener("resize",resize);return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",resize);};},[menuPosition]);
  function menuKeys(event:KeyboardEvent<HTMLElement>){escape(event);const keys=["ArrowDown","ArrowUp","Home","End"];if(!keys.includes(event.key))return;event.preventDefault();const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button")||[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}
  const content=<aside ref={root} data-dock-panel="markets" className={`market-sidebar markets-panel ${isFloating?"markets-floating":right?"markets-right":"markets-left"}`} role={isFloating?"dialog":undefined} aria-modal={isFloating?false:undefined} aria-label={isFloating?"Выбор торговой пары":"Торговые пары"} tabIndex={-1}
    style={isFloating?{left:floating.layout.x,top:floating.layout.y,width:floating.layout.width,height:floating.layout.height}:{width:width.width}}
    onPointerMove={isFloating?floating.move:undefined} onPointerUp={isFloating?floating.end:undefined} onPointerCancel={isFloating?floating.end:undefined} onLostPointerCapture={isFloating?floating.end:undefined} onKeyDown={escape}>
    <header className="markets-panel-header" tabIndex={0} aria-label={isFloating?"Переместить список пар":"Рынки"} title="Перетащите за шапку, чтобы переместить или закрепить окно" onPointerDown={event=>dock.start("markets",event)} onKeyDown={isFloating?event=>floating.key(event):undefined}>
      <h2 id={titleId}>Рынки <small>{EXCHANGES[exchange].name}</small></h2><span className="markets-count">{total??"—"}</span>
      <button aria-label={isFloating?"Закрепить список пар":"Открепить список пар"} title={isFloating?"Закрепить справа":"Плавающее окно"} onClick={()=>save({mode:isFloating?"right":"floating"})}>{isFloating?<Pin size={13}/>:<PinOff size={13}/>}</button>
      <button ref={menuButton} aria-label="Расположение списка пар" aria-expanded={!!menuPosition} onClick={openMenu}><MoreHorizontal size={15}/></button>
      <button aria-label="Скрыть список пар" title="Скрыть; открыть снова кнопкой «Рынки» над графиком" onClick={close}><X size={14}/></button>
    </header>
    <div className="sidebar-filters markets-filters">
      <label className="search-field"><Search size={13}/><input placeholder="Найти пару" aria-label="Поиск торговой пары" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button onClick={()=>setSearch("")} aria-label="Очистить поиск"><X size={12}/></button>}</label>
      <button className={`markets-favorites-filter ${settings.favoritesOnly?"selected":""}`} aria-label="Только избранные" aria-pressed={settings.favoritesOnly} title="Только избранные пары выбранной биржи и валюты" onClick={()=>save({favoritesOnly:!settings.favoritesOnly})}><Star size={14} fill={settings.favoritesOnly?"currentColor":"none"}/></button>
    </div>
    <div className="markets-quote-row">
      <div className="markets-quote-tabs" role="group" aria-label="Валюты пар">{currencies.slice(0,4).map(asset=><button key={asset} aria-pressed={quote===asset} onClick={()=>setQuote(asset)}>{asset}</button>)}</div>
      <select className="quote-select" aria-label="Валюта котировки" title="Все валюты котировки" value={quote} disabled={!catalogReady} onChange={event=>setQuote(event.target.value)}>{!currencies.length&&quote!=="all"&&<option value={quote}>{quote}</option>}{currencies.map(asset=><option key={asset} value={asset}>{asset}</option>)}<option value="all">Все</option></select>
      <label className="sort-select"><ArrowUpDown size={11}/><select aria-label="Сортировка пар" value={sort} onChange={event=>setSort(event.target.value as Props["sort"])}><option value="volume" disabled={statsReady&&!volumeAvailable}>По объёму</option><option value="change" disabled={statsReady&&!changeAvailable}>По росту</option><option value="name">По имени</option></select></label>
    </div>
    <div className="pair-list-labels markets-columns"><span>Пара</span><span>Цена</span><span>24ч</span></div>
    <div className="pair-list" key={`${exchange}:${quote}`} tabIndex={0} aria-label="Список торговых пар" aria-busy={loading}>
      {loading&&<><span className="sr-only" role="status">Загружаем пары и котировки {EXCHANGES[exchange].name}</span>{Array.from({length:12},(_,index)=><div key={index} className="pair-row pair-skeleton" aria-hidden="true"><span className="pair-skeleton-name"/><span className="pair-skeleton-numbers"><i/><i/></span></div>)}</>}
      {visible.map(pair=><PairRow key={pair.symbol} pair={pair} ticker={tickers.get(pair.symbol)} livePrice={ticks?.get(pair.symbol)?.price} active={selected===pair.symbol} select={select} favorite={favorites.has(favoriteKey(pair))} toggleFavorite={toggleFavorite}/>)}
      {!loading&&!visible.length&&<div className="empty-list">{error?<><p>{error}</p><button className="button" onClick={refresh}>Повторить</button></>:settings.favoritesOnly?"Нет избранных пар для этой валюты. Добавьте их звёздочкой в общем списке.":"Пары не найдены. Попробуйте другой запрос."}</div>}
    </div>
    {isFloating?(["n","s","e","w","ne","nw","se","sw"] as const).map(edge=><div key={edge} className={`book-resize book-resize-${edge}`} onPointerDown={event=>floating.start(event,edge)} {...(edge==="se"?{role:"button",tabIndex:0,"aria-label":"Изменить размер списка пар",onKeyDown:(event:KeyboardEvent<HTMLElement>)=>floating.key(event,true)}:{"aria-hidden":true})}/> )
      :!props.inColumn&&<div className={`markets-dock-resize ${right?"on-left":"on-right"}`} role="separator" tabIndex={0} aria-label="Ширина списка пар" aria-orientation="vertical" aria-valuenow={width.width} aria-valuemin={280} aria-valuemax={480} onPointerDown={width.start} onPointerMove={event=>width.move(event,right)} onPointerUp={width.end} onPointerCancel={width.end} onLostPointerCapture={width.end} onKeyDown={event=>width.key(event,right)}/>}
  </aside>;
  return <>{isFloating?createPortal(content,document.body):content}{menuPosition&&createPortal(<div ref={menu} className="markets-placement-menu" role="menu" aria-label="Расположение списка пар" style={menuPosition} onKeyDown={menuKeys}>
    {([['right','Закрепить справа'],['left','Закрепить слева'],['floating','Плавающее окно']] as const).map(([mode,label])=><button key={mode} role="menuitemradio" aria-checked={settings.mode===mode} onClick={()=>{save({mode});setMenuPosition(null);}}>{label}</button>)}
    <button role="menuitem" onClick={()=>{setMenuPosition(null);close();}}>Скрыть список пар</button>
  </div>,document.body)}</>;
}
