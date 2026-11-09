"use client";
import { useEffect,useRef,useState } from "react";
import { ExternalLink,RefreshCw,X } from "lucide-react";
import { type CoinProfile } from "@/lib/market/coin-profile";
import {type CoinCandidate} from "@/lib/market/coin-catalog";
import type { Ticker,TradingPair } from "@/lib/market/types";
import { EXCHANGES } from "@/lib/market/exchange-config";
import { coinNames,compact,percent,price } from "@/lib/market/format";
import { CoinIcon } from "./CoinIcon";
import { CoinListings } from "./CoinListings";
import {usdtVolume} from "@/lib/market/usdt-volume";

function date(value:string|null|undefined){return value?new Date(value).toLocaleDateString("ru-RU"):"—";}
export function CoinInfoDialog({pair,ticker,lastPrice,usdtUsdRate,close}:{pair:TradingPair;ticker?:Ticker;lastPrice?:number;usdtUsdRate?:number;close:()=>void}){
  const choiceKey=`sinex:coin-project:${pair.exchange}:${pair.marketType}:${pair.symbol}`;
  const dialog=useRef<HTMLDialogElement>(null),[info,setInfo]=useState<CoinProfile>(),[error,setError]=useState(""),[loading,setLoading]=useState(true),[stale,setStale]=useState(false),[revision,setRevision]=useState(0);
  const [candidates,setCandidates]=useState<CoinCandidate[]>([]),[choice,setChoice]=useState<CoinCandidate|undefined>(()=>{try{const saved=JSON.parse(localStorage.getItem(choiceKey)||"null");return saved&&typeof saved.id==="string"&&["coingecko","coinpaprika"].includes(saved.provider)?saved:undefined;}catch{return undefined;}});
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try{
        const query=new URLSearchParams({asset:pair.baseAsset,exchange:pair.exchange,quote:pair.quoteAsset});
        if(choice){query.set("id",choice.id);query.set("provider",choice.provider);}
        const response=await fetch(`/api/market/coin?${query}`,{signal:controller.signal});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error?.message||"Не удалось загрузить информацию.");
        if(!controller.signal.aborted){if(result.candidates)setCandidates(result.candidates);else{setInfo(result.data);setStale(result.stale);}}
      }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Не удалось загрузить информацию.");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return()=>controller.abort();
  },[pair.baseAsset,pair.exchange,pair.quoteAsset,choice,revision]);
  function chooseProject(candidate:CoinCandidate){setChoice(candidate);setInfo(undefined);setLoading(true);setError("");try{localStorage.setItem(choiceKey,JSON.stringify(candidate));}catch{/* The choice still applies to the open dialog. */}}
  const market=info?.market;
  const volume=usdtVolume(pair,ticker,lastPrice,usdtUsdRate);
  const metric=(label:string,value:string,extra?:string)=><div key={label}><dt>{label}</dt><dd>{value}{extra&&<small>{extra}</small>}</dd></div>;
  const usd=(value:number|null|undefined)=>value==null?"—":`$${price(value)}`;
  const money=(value:number|null|undefined)=>value==null?"—":`$${compact(value)}`;
  return <dialog ref={dialog} className="account-dialog coin-info-dialog" onCancel={close} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();}}} aria-labelledby="coin-info-title">
    <button className="account-close" onClick={close} aria-label="Закрыть информацию о монете"><X size={18}/></button>
    <div className="coin-info-heading"><CoinIcon asset={pair.baseAsset}/><div><h2 id="coin-info-title">{info?.name||coinNames[pair.baseAsset]||pair.baseAsset}</h2><span>{pair.baseAsset}{info?.rank?` · №${info.rank} по капитализации`:""}</span></div></div>
    {info&&info.contracts.length>0&&<section className="coin-info-section coin-info-contracts-pinned" aria-label="Контракты по сетям"><h3>Контракты по сетям</h3><dl className="coin-info-contracts">{info.contracts.map(contract=><div key={`${contract.network}:${contract.address}`}><dt>{contract.network}</dt><dd><code>{contract.address}</code></dd></div>)}</dl></section>}
    <section className="coin-info-section"><h3>{EXCHANGES[pair.exchange].name} · {pair.baseAsset}/{pair.quoteAsset} · Spot</h3>
      <dl className="coin-info-metrics">
        {metric("Последняя цена",`${price(lastPrice)} ${pair.quoteAsset}`)}
        {metric("Изменение за 24ч",percent(ticker?.priceChangePercent24h))}
        {metric("Максимум за 24ч",ticker?`${price(ticker.high24h)} ${pair.quoteAsset}`:"—")}
        {metric("Минимум за 24ч",ticker?`${price(ticker.low24h)} ${pair.quoteAsset}`:"—")}
        <div title={volume.hint}><dt>Оборот за 24ч</dt><dd>{volume.estimated?"≈ ":""}{compact(volume.value)} USDT</dd></div>
        {metric("Bid / Ask",ticker?`${price(ticker.bid)} / ${price(ticker.ask)} ${pair.quoteAsset}`:"—")}
      </dl>
      <CoinListings pair={pair}/>
    </section>
    <div className="coin-info-body" role="region" aria-label="Подробная информация о монете" tabIndex={0}>
    {candidates.length>1&&<section className="coin-info-section coin-project-picker"><h3>Уточните проект</h3><p className="account-hint">У нескольких монет тикер {pair.baseAsset}. Выберите проект, чтобы увидеть его историю и создателей.</p><div>{candidates.map(candidate=><button key={`${candidate.provider}:${candidate.id}`} className="button" aria-pressed={choice?.id===candidate.id&&choice?.provider===candidate.provider} onClick={()=>chooseProject(candidate)} disabled={loading}>{candidate.name}<small>{candidate.provider==="coingecko"?"CoinGecko":"CoinPaprika"} · {candidate.id}</small></button>)}</div></section>}
    {loading&&<p className="account-hint" role="status">Загрузка информации о монете…</p>}
    {error&&<div className="coin-info-error" role="alert"><p>{error}</p><button className="button" onClick={()=>{setError("");setLoading(true);if(choice){setChoice(undefined);try{localStorage.removeItem(choiceKey);}catch{}}setRevision(old=>old+1);}}><RefreshCw size={12}/> Повторить</button></div>}
    {info&&<>
      <section className="coin-info-section"><h3>О проекте</h3><p className="coin-info-description">{info.description||"Описание не предоставлено источником."}</p>{info.description&&info.descriptionLanguage==="en"&&<span className="account-hint">Описание источника на английском языке</span>}
        <div className="coin-info-tags">{info.categories.map(category=><span key={category}>{category}</span>)}</div>
        <dl className="coin-info-metrics">{metric("Дата запуска",info.genesisDate?date(info.genesisDate):"Не указана источниками")}{metric("Создатели",info.creators?.length?info.creators.map(person=>person.name).join(", "):"Не указаны источниками")}{metric("Алгоритм",info.algorithm||"—")}</dl>
      </section>
      {info.exchangeDescription&&<section className="coin-info-section"><h3>Описание на {info.exchangeDescription.name}</h3><p className="coin-info-description">{info.exchangeDescription.text}</p><a className="coin-info-link" href={info.exchangeDescription.url} target="_blank" rel="noopener noreferrer">Страница монеты на {info.exchangeDescription.name}<ExternalLink size={12}/></a></section>}
      {info.history&&<section className="coin-info-section"><h3>История проекта</h3><p className="coin-info-description">{info.history}</p>{info.historySource&&<a className="coin-info-link" href={info.historySource.url} target="_blank" rel="noopener noreferrer">{info.historySource.name}<ExternalLink size={12}/></a>}</section>}
      {market&&<section className="coin-info-section"><h3>Общий рынок · USD</h3><dl className="coin-info-metrics">
        {metric("Средняя цена",usd(market.current_price))}{metric("Капитализация",money(market.market_cap))}
        {metric("Полная оценка (FDV)",money(market.fully_diluted_valuation))}{metric("Объём торгов за 24ч",money(market.total_volume))}
        {metric("В обращении",compact(market.circulating_supply),pair.baseAsset)}{metric("Общая эмиссия",compact(market.total_supply),pair.baseAsset)}
        {metric("Максимальная эмиссия",compact(market.max_supply),market.max_supply==null?"Не указана источником":pair.baseAsset)}
        {metric("Исторический максимум",usd(market.ath),date(market.ath_date))}{metric("Исторический минимум",usd(market.atl),date(market.atl_date))}
        {metric("Изменение · 24ч",percent(market.price_change_percentage_24h))}{metric("Изменение · 7 дней",percent(market.price_change_percentage_7d))}
        {metric("Изменение · 30 дней",percent(market.price_change_percentage_30d))}{metric("Изменение · год",percent(market.price_change_percentage_1y))}
      </dl></section>}
      <section className="coin-info-section"><h3>Ссылки проекта</h3><div className="coin-info-links">{info.links.map(link=><a key={link.url} className="coin-info-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={12}/></a>)}</div></section>
      <footer className="coin-info-footer"><a className="coin-info-link" href={info.sourceUrl} target="_blank" rel="noopener noreferrer">{info.sourceName||"CoinGecko"} <ExternalLink size={12}/></a>{info.additionalSources?.filter(source=>source.url!==info.sourceUrl&&source.url!==info.historySource?.url).map(source=><a key={source.url} className="coin-info-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.name}<ExternalLink size={12}/></a>)}<span>{stale?"Сохранённые данные · источник временно недоступен":`Обновлено: ${info.updatedAt?new Date(info.updatedAt).toLocaleString("ru-RU"):"время не указано"}`}</span></footer>
    </>}
    </div>
  </dialog>;
}
