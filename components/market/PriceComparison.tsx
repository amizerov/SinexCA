"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {z} from "zod";
import {EXCHANGES,EXCHANGE_IDS,tradingUrl} from "@/lib/market/exchange-config";
import type {ExchangeId} from "@/lib/market/types";
import {COMPARISON_ASSETS,freshQuote,opportunities,type Opportunity,type VenueSnapshot,depthEstimate} from "@/lib/market/comparison/model";
import {BrandMark} from "./BrandMark";
import {ThemeToggle} from "@/components/ThemeToggle";
import {AccountButton} from "@/components/Account";
import "./price-comparison.css";

const settingsSchema=z.object({exchanges:z.array(z.enum(EXCHANGE_IDS)).min(1).max(14),budget:z.number().min(1).max(1000000),fees:z.record(z.enum(EXCHANGE_IDS),z.number().min(0).max(5)),favorites:z.array(z.enum(COMPARISON_ASSETS)).max(20)});
const initial={exchanges:["binance","bybit","okx"] as ExchangeId[],budget:1000,fees:Object.fromEntries(EXCHANGE_IDS.map(id=>[id,.1])) as Record<ExchangeId,number>,favorites:[] as string[]};
const number=(value:number|null|undefined,digits=8)=>value===null||value===undefined||!Number.isFinite(value)?"—":value.toLocaleString("ru-RU",{maximumFractionDigits:digits});
type Estimate=Awaited<ReturnType<typeof depthEstimate>>;
interface Checked {key:string;estimate?:Estimate;at?:number;error?:string;loading?:boolean}
type SortKey="name"|"spread";
interface SortState {key:SortKey;direction:"asc"|"desc"}

export function PriceComparison(){
  const [settings,setSettings]=useState(initial),[ready,setReady]=useState(false),[snapshots,setSnapshots]=useState<Partial<Record<ExchangeId,VenueSnapshot>>>({});
  const [now,setNow]=useState(0),[tab,setTab]=useState<"matrix"|"routes">("matrix");
  const [search,setSearch]=useState(""),[positiveOnly,setPositiveOnly]=useState(false),[checked,setChecked]=useState<Checked>();
  const [sort,setSort]=useState<SortState>({key:"name",direction:"asc"});
  const request=useRef<AbortController|null>(null);
  const settingsDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{void Promise.resolve().then(()=>{try{const value=settingsSchema.safeParse(JSON.parse(localStorage.getItem("sinex:comparison:v1")||"null"));if(value.success)setSettings({...value.data,exchanges:[...new Set(value.data.exchanges)]});}catch{}setReady(true);setNow(Date.now());});},[]);
  useEffect(()=>{if(ready)try{localStorage.setItem("sinex:comparison:v1",JSON.stringify(settings));}catch{/* The live view works without persistence. */}},[settings,ready]);
  const exchangeKey=settings.exchanges.join(",");
  useEffect(()=>{
    if(!ready)return;let stopped=false;
    const stream=new EventSource(`/api/market/comparison?${new URLSearchParams({exchanges:exchangeKey})}`);
    stream.onmessage=event=>{if(stopped)return;try{const snapshot=JSON.parse(event.data) as VenueSnapshot;if(!exchangeKey.split(",").includes(snapshot.exchange)||!Array.isArray(snapshot.quotes)||!Array.isArray(snapshot.available))return;setSnapshots(old=>({...old,[snapshot.exchange]:snapshot}));setNow(Date.now());}catch{/* EventSource reconnects and the next valid snapshot replaces this message. */}};
    return()=>{stopped=true;stream.close();};
  },[exchangeKey,ready]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(timer);request.current?.abort();};},[]);
  const quotes=useMemo(()=>settings.exchanges.flatMap(exchange=>snapshots[exchange]?.quotes||[]),[settings.exchanges,snapshots]);
  const routes=useMemo(()=>opportunities(quotes,settings.fees,settings.budget,now),[quotes,settings.fees,settings.budget,now]);
  const direction=sort.direction==="asc"?1:-1;
  const assets=COMPARISON_ASSETS.filter(asset=>asset.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>direction*(sort.key==="spread"?(routes.find(route=>route.asset===a)?.netPercent??-Infinity)-(routes.find(route=>route.asset===b)?.netPercent??-Infinity):a.localeCompare(b)));
  const visibleRoutes=[...routes.filter(route=>assets.includes(route.asset as typeof COMPARISON_ASSETS[number])&&(!positiveOnly||route.netPercent>0))].sort((a,b)=>direction*(sort.key==="spread"?a.netPercent-b.netPercent:a.asset.localeCompare(b.asset))).slice(0,100);
  const currentKey=(route:Opportunity)=>`${route.asset}:${route.buy.exchange}:${route.sell.exchange}:${settings.budget}:${settings.fees[route.buy.exchange]}:${settings.fees[route.sell.exchange]}`;
  async function checkDepth(route:Opportunity){
    request.current?.abort();const controller=new AbortController();request.current=controller;const key=currentKey(route);setChecked({key,loading:true});
    try{
      const response=await fetch(`/api/market/comparison-depth?${new URLSearchParams({asset:route.asset,buy:route.buy.exchange,sell:route.sell.exchange,budget:String(settings.budget),buyFee:String(settings.fees[route.buy.exchange]),sellFee:String(settings.fees[route.sell.exchange])})}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])}),json=await response.json();
      if(!response.ok)throw new Error(json.error?.message||"Не удалось проверить стаканы");
      if(!controller.signal.aborted)setChecked({key,estimate:json.data.estimate,at:json.data.estimate.receivedAt||json.data.checkedAt||now});
    }catch(error){if(!controller.signal.aborted)setChecked({key,error:error instanceof Error?error.message:"Ошибка проверки"});}
  }
  function selectExchange(id:ExchangeId){setSettings(old=>({...old,exchanges:old.exchanges.includes(id)?old.exchanges.length===1?old.exchanges:old.exchanges.filter(item=>item!==id):EXCHANGE_IDS.filter(item=>old.exchanges.includes(item)||item===id)}));}
  function toggleSort(key:SortKey){setSort(old=>old.key===key?{key,direction:old.direction==="asc"?"desc":"asc"}:{key,direction:key==="spread"?"desc":"asc"});}
  const sortMark=(key:SortKey)=>sort.key===key?(sort.direction==="asc"?"↑":"↓"):"↕";
  const toggleFavorite=(asset:string)=>setSettings(old=>{const favorites=old.favorites.includes(asset)?old.favorites.filter(item=>item!==asset):[...old.favorites,asset];return {...old,favorites};});
  const tableNotes=<>
      <div className="comparison-source-errors">{settings.exchanges.filter(id=>snapshots[id]?.error).map(id=><p key={id} role="status"><b>{EXCHANGES[id].name}:</b> {snapshots[id]?.error}</p>)}</div>
      <footer className="comparison-footer">Оценки не включают переводы и ребалансировку. Сопоставление по коду актива; сети, контракты, ввод/вывод и балансы не проверены. <Link href="/help/price-comparison">Как читать таблицу и проверять направление ↗</Link></footer>
  </>;
  return <div className="comparison-page">
    <header className="topbar comparison-topbar"><Link className="brand" href="/"><span className="brand-mark"><BrandMark/></span><span className="brand-name">Sinex<small>markets</small></span></Link><nav aria-label="Разделы терминала"><Link href="/">Терминал</Link><Link href="/prices" aria-current="page">Цены на биржах</Link><Link href="/help/price-comparison">Справка</Link></nav><ThemeToggle/><AccountButton/></header>
    <main className="comparison-main">
      <div className="comparison-title"><div className="comparison-title-copy"><span className="comparison-eyebrow">SPOT · USDT</span><h1>Цены на биржах</h1><p>Сравнение Ask и Bid на выбранных площадках</p></div><button className="comparison-settings-button" type="button" aria-haspopup="dialog" onClick={()=>settingsDialog.current?.showModal()}>Настройки</button></div>
      <dialog ref={settingsDialog} className="comparison-settings-dialog" aria-labelledby="comparison-settings-title" onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.currentTarget.close();}}}>
        <div className="comparison-settings-heading"><h2 id="comparison-settings-title">Настройки</h2><button type="button" aria-label="Закрыть настройки" onClick={()=>settingsDialog.current?.close()}>×</button></div>
        <section className="comparison-settings-section"><h3>Биржи</h3><div className="comparison-venues">{EXCHANGE_IDS.map(id=><button key={id} className={settings.exchanges.includes(id)?"selected":""} aria-pressed={settings.exchanges.includes(id)} onClick={()=>selectExchange(id)}>{EXCHANGES[id].name}</button>)}</div></section>
        <section className="comparison-settings-section comparison-settings-fees"><h3>Комиссии, %</h3>{settings.exchanges.map(id=><label key={id}>{EXCHANGES[id].name}, %<input aria-label={`Комиссия ${EXCHANGES[id].name}`} type="number" min="0" max="5" step="0.01" value={settings.fees[id]} onChange={event=>setSettings({...settings,fees:{...settings.fees,[id]:Number(event.target.value)}})}/></label>)}<small>Персональный taker-тариф биржи доступен только через приватный API аккаунта. Пока read-only ключ не подключён, используется сохранённое в этом браузере значение; 0,1% по умолчанию — резерв, а не полученный тариф.</small></section>
        <form method="dialog" className="comparison-settings-actions"><button className="button">Готово</button></form>
      </dialog>
      <div className="comparison-toolbar"><div className="comparison-tabs" role="tablist" aria-label="Вид сравнения"><button id="prices-matrix-tab" role="tab" aria-selected={tab==="matrix"} aria-controls="prices-matrix" onClick={()=>setTab("matrix")}>Цены по биржам</button><button id="prices-routes-tab" role="tab" aria-selected={tab==="routes"} aria-controls="prices-routes" onClick={()=>setTab("routes")}>Направления покупки и продажи</button></div><input className="comparison-search" type="search" aria-label="Поиск монеты" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Поиск"/></div>
      {tab==="matrix"?<section id="prices-matrix" role="tabpanel" aria-labelledby="prices-matrix-tab"><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th scope="col" aria-sort={sort.key==="name"?(sort.direction==="asc"?"ascending":"descending"):"none"}><button className="comparison-sort-button" onClick={()=>toggleSort("name")}>Монета <span>{sortMark("name")}</span></button></th>{settings.exchanges.map(id=><th key={id} scope="col">{EXCHANGES[id].name}<small>{snapshots[id]?.status==="live"?"WebSocket":snapshots[id]?.status==="rest"?"REST · проверка каждые 5 с":snapshots[id]?.status==="error"?"Источник недоступен":"Подключение…"}</small></th>)}<th scope="col" aria-sort={sort.key==="spread"?(sort.direction==="asc"?"ascending":"descending"):"none"}><button className="comparison-sort-button comparison-sort-best" onClick={()=>toggleSort("spread")}>Лучшее направление <span>{sortMark("spread")}</span></button><small>после заданных комиссий</small></th></tr></thead><tbody>{assets.map(asset=>{
        const best=routes.find(route=>route.asset===asset);
        return <tr key={asset}><th scope="row"><button title={settings.favorites.includes(asset)?"Убрать отметку":"Отметить монету"} aria-label={settings.favorites.includes(asset)?`Убрать ${asset} из отмеченных`:`Отметить ${asset}`} onClick={()=>toggleFavorite(asset)} className={settings.favorites.includes(asset)?"favorite":""}>{settings.favorites.includes(asset)?"★":"☆"}</button>{asset}<small>/ USDT</small></th>{settings.exchanges.map(id=>{const snapshot=snapshots[id],quote=snapshot?.quotes.find(q=>q.asset===asset),fresh=quote&&freshQuote(quote,now);return <td key={id} className={quote&&!fresh?"comparison-stale":""}>{quote?<><strong><span className="comparison-side">{quote.ask===null?"Last":"Ask"}</span>{number(quote.ask??quote.last)}</strong><span><span className="comparison-side">Bid</span>{number(quote.bid)}</span>{(quote.ask===null||!fresh)&&<small>{quote.ask===null?"Ask недоступен · показана последняя сделка":""}{quote.ask===null&&!fresh?" · ":""}{!fresh?"Устарело":""}</small>}</>:<span className="muted">{snapshot?.status==="error"?"Ошибка источника":snapshot?.available.includes(asset)?"Нет котировки":snapshot?.status==="connecting"||!snapshot?"…":"Нет пары USDT"}</span>}</td>;})}<td>{best?<><strong className={best.netPercent>0?"positive":"negative"}>{number(best.netPercent,3)}%</strong><small>{EXCHANGES[best.buy.exchange].name} → {EXCHANGES[best.sell.exchange].name}</small></>:<span className="muted">Нет свежей пары Bid/Ask</span>}</td></tr>;
      })}</tbody></table>{tableNotes}</div>{!assets.length&&<p className="comparison-empty">Монеты не найдены. Измените поиск.</p>}</section>:<section id="prices-routes" role="tabpanel" aria-labelledby="prices-routes-tab"><label className="comparison-check comparison-route-filter"><input type="checkbox" checked={positiveOnly} onChange={event=>setPositiveOnly(event.target.checked)}/>Только положительная оценка после комиссий</label><div className="comparison-table-wrap"><table className="comparison-table comparison-routes"><caption>До 100 направлений · расчёт по лучшим заявкам, глубина проверяется отдельно</caption><thead><tr><th aria-sort={sort.key==="name"?(sort.direction==="asc"?"ascending":"descending"):"none"}><button className="comparison-sort-button" onClick={()=>toggleSort("name")}>Монета <span>{sortMark("name")}</span></button></th><th>Купить · Ask</th><th>Продать · Bid</th><th>До комиссий</th><th aria-sort={sort.key==="spread"?(sort.direction==="asc"?"ascending":"descending"):"none"}><button className="comparison-sort-button" onClick={()=>toggleSort("spread")}>После комиссий <span>{sortMark("spread")}</span></button></th><th>Оценка, USDT</th><th>Объём на лучших ценах</th><th>Проверка стаканов</th></tr></thead><tbody>{visibleRoutes.map(route=>{const key=currentKey(route),result=checked?.key===key?checked:undefined,depthStale=result?.at!==undefined&&now-result.at>5000;return <tr key={`${route.asset}:${route.buy.exchange}:${route.sell.exchange}`}><th scope="row">{route.asset}</th><td><a href={tradingUrl(route.buy.exchange,{exchange:route.buy.exchange,marketType:"spot",symbol:route.buy.symbol,baseAsset:route.asset,quoteAsset:"USDT"})} target="_blank" rel="noreferrer">{EXCHANGES[route.buy.exchange].name} ↗</a><strong>{number(route.buy.ask)}</strong></td><td><a href={tradingUrl(route.sell.exchange,{exchange:route.sell.exchange,marketType:"spot",symbol:route.sell.symbol,baseAsset:route.asset,quoteAsset:"USDT"})} target="_blank" rel="noreferrer">{EXCHANGES[route.sell.exchange].name} ↗</a><strong>{number(route.sell.bid)}</strong></td><td>{number(route.grossPercent,3)}%</td><td className={route.netPercent>0?"positive":"negative"}>{number(route.netPercent,3)}%</td><td className={route.estimatedProfit>0?"positive":"negative"}>{number(route.estimatedProfit,2)}</td><td>{route.topSizeSufficient===null?"Не сообщён":route.topSizeSufficient?"Достаточен":"Нужна глубина"}</td><td><button className="button" disabled={result?.loading||settings.budget<1||settings.budget>1000000} onClick={()=>void checkDepth(route)}>{result?.loading?"Проверка…":"Проверить сумму"}</button>{result?.error&&<small role="alert">{result.error}</small>}{result?.estimate&&<small className={depthStale?"muted":result.estimate.complete&&result.estimate.profit>0?"positive":"negative"}>{depthStale?"Проверка устарела":result.estimate.complete?`${number(result.estimate.profit,2)} USDT · ${number(result.estimate.percent,3)}% по глубине`:result.estimate.reason}</small>}</td></tr>;})}</tbody></table>{tableNotes}</div>{!visibleRoutes.length&&<p className="comparison-empty">Нет подходящих свежих направлений. Попробуйте другие биржи или снимите фильтр положительных оценок.</p>}</section>}

    </main>
  </div>;
}
