"use client";
import {useMemo,useState} from "react";
import {ChevronDown} from "lucide-react";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {useOrderBook} from "@/hooks/use-order-book";
import {estimatePosition,type PaperPosition} from "@/lib/paper/portfolio";
import type {Portfolio} from "@/lib/paper/portfolio";
import type {TradingPair} from "@/lib/market/types";
const number=(value:number,digits=8)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:digits}).format(value);
const signed=(value:number,digits=2)=>`${value>0?"+":""}${number(value,digits)}`;
export function AccountPositions({portfolio}:{portfolio?:Portfolio}){
  const [selected,setSelected]=useState<string|null>();
  const positions=portfolio?.positions||[],key=selected===undefined?positions.find(p=>p.quantity>0)?.key: selected;
  if(!positions.length)return null;
  return <section className="account-positions" aria-label="Результат покупок"><div className="paper-history-title"><h3>Результат покупок</h3><span className="account-position-note">С учётом DEMO-комиссий</span></div>
    {positions.map(position=><div className="account-position" key={position.key}>
      <button type="button" className="account-position-summary" aria-expanded={key===position.key} onClick={()=>setSelected(key===position.key?null:position.key)}><strong>{number(position.quantity)} {position.base}</strong><span className="account-position-venue">{EXCHANGES[position.exchange]?.name||position.exchange}</span><span className="account-position-basis">{position.quantity>0?`Покупка ${number(position.average,8)} ${position.quote}`:"Продано"}</span><ChevronDown size={14}/></button>
      {key===position.key&&(position.quantity>0?<PositionEstimate key={position.key} position={position}/>:<div className="account-position-closed">Продано · результат <strong className={(position.realized??0)>=0?"positive":"negative"}>{position.realized==null?"Себестоимость неизвестна":`${signed(position.realized)} ${position.quote}`}</strong></div>)}
    </div>)}
  </section>;
}
function PositionEstimate({position}:{position:PaperPosition}){
  const {exchange,symbol,base,marketQuote}=position,pair=useMemo<TradingPair>(()=>({exchange,symbol,baseAsset:base,quoteAsset:marketQuote,marketType:"spot"}),[exchange,symbol,base,marketQuote]);
  const source=useOrderBook(pair),estimate=estimatePosition(position,source.book),valid=estimate.status==="ok"&&!source.stale&&!source.error;
  const money=(value:number)=>`${number(value,Math.abs(value)>=1?2:8)} ${position.quote}`;
  const status=source.error?"Нет свежего стакана":source.stale?"Стакан устарел":estimate.status==="depth"?`Недостаточно глубины: доступно ${number(estimate.covered??0)} ${base}`:estimate.status==="reserved"?"Монеты зарезервированы заявками":estimate.status==="currency"?"Валюта себестоимости отличается от валюты пары":estimate.status==="stale"?"Получаем свежий стакан…":null;
  return <div className="account-position-details">
    <div><span>Затраты на остаток</span><strong>{money(position.cost)}</strong></div>
    <div><span>Продажа {number(position.available)} {base} ≈</span><strong>{valid?money(estimate.net!):"—"}</strong></div>
    <div><span>Прибыль / убыток ≈</span><strong data-position-pnl className={valid?estimate.pnl!>=0?"positive":"negative":""}>{valid?`${signed(estimate.pnl!,Math.abs(estimate.pnl!)>=1?2:8)} ${position.quote}`:"—"}{valid&&<small>{signed(estimate.percent!)}%</small>}</strong></div>
    <div><span>Цена безубыточности ≈</span><strong>{estimate.status!=="currency"?`${number(estimate.breakEven,6)} ${position.quote}`:"—"}</strong></div>
    <p className="account-position-footnote">{status?<span role="status">{status}</span>:<>По покупателям в стакане {EXCHANGES[exchange].name} · {source.book&&new Date(source.book.receivedAt).toLocaleTimeString("ru-RU")}</>}{position.available<position.quantity&&<span>Часть монет в заявках; оценка только свободного остатка.</span>}{position.realized!==0&&<span>Зафиксировано: {position.realized==null?"неизвестна себестоимость":money(position.realized)}</span>}</p>
  </div>;
}
