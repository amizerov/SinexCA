"use client";
import {useMemo,useState} from "react";
import {Search,X} from "lucide-react";
import {filterIndicatorCatalog,INDICATOR_CATALOG,INDICATOR_CATEGORIES} from "@/lib/indicators/catalog";
export function IndicatorCatalog({openSettings}:{openSettings:()=>void}){
  const [query,setQuery]=useState(""),[category,setCategory]=useState("");
  const indicators=useMemo(()=>filterIndicatorCatalog(query,category),[query,category]);
  return <div className="indicator-catalog">
    <p className="account-hint">Каталог для индивидуальной разработки. «На заказ» — пока не подключён к графику. Можно разработать и индикатор по вашей формуле.</p>
    <div className="indicator-catalog-filters"><label className="indicator-catalog-search"><Search size={13}/><input aria-label="Поиск индикатора" placeholder="Название или назначение" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" onClick={()=>setQuery("")} aria-label="Очистить поиск индикаторов"><X size={12}/></button>}</label><select aria-label="Категория индикаторов" value={category} onChange={event=>setCategory(event.target.value)}><option value="">Все категории</option>{INDICATOR_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></div>
    <div className="indicator-catalog-count" role="status">{indicators.length} из {INDICATOR_CATALOG.length}</div>
    <div className="indicator-catalog-list" role="list" aria-label="Каталог технических индикаторов" tabIndex={0}>
      {indicators.map(indicator=><div role="listitem" className="indicator-catalog-item" key={indicator.id}><div><strong>{indicator.name}</strong><p>{indicator.description}</p><small>{indicator.category}{indicator.requires?` · ${indicator.requires}`:""}</small></div>{indicator.available?<button type="button" className="catalog-available" title="Открыть настройки доступных индикаторов" onClick={openSettings}>Доступен</button>:<span className="catalog-on-order">На заказ</span>}</div>)}
      {!indicators.length&&<p className="indicator-catalog-empty">Не найдено. Попробуйте другое название или выберите все категории.</p>}
    </div>
    <p className="indicator-catalog-footer">Каталог расширяется: единого полного списка авторских индикаторов нет. Справочники: <a href="https://ta-lib.org/functions/" target="_blank" rel="noopener noreferrer">TA-Lib</a> · <a href="https://www.tradingview.com/support/categories/indicators/" target="_blank" rel="noopener noreferrer">TradingView</a></p>
  </div>;
}
