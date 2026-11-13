"use client";
import {useMarketResource} from "@/hooks/use-market-resource";
import {useWorkspacePreferences} from "@/hooks/use-workspace-preferences";
import {EXCHANGES,EXCHANGE_IDS} from "@/lib/market/exchange-config";
import type {ExchangeId,TradingPair} from "@/lib/market/types";
import {favoriteKey} from "@/lib/ui/market-panel-settings";

function SavedRow({id,open,remove}:{id:string;open:(pair:TradingPair)=>void;remove:()=>void}){
  const exchange=id.split(":")[0] as ExchangeId;
  const catalog=useMarketResource<TradingPair[]>(`/api/market/pairs?exchange=${exchange}&quote=all`);
  const pair=catalog.data?.find(pair=>favoriteKey(pair)===id);
  return <div className="saved-market-row"><button disabled={!pair} onClick={()=>pair&&open(pair)} title={catalog.error||undefined}><strong>{pair?`${pair.baseAsset}/${pair.quoteAsset}`:id.split(":").slice(2).join(":")}</strong><small>{EXCHANGES[exchange].name} · Spot{!pair?catalog.error?" · ошибка загрузки":catalog.data?" · недоступна":" · загрузка…":""}</small></button><button aria-label={`Удалить ${id}`} onClick={remove}>×</button></div>;
}

// One catalog request per exchange, including when several saved symbols share it.
function SavedGroup({exchange,ids,open,remove}:{exchange:ExchangeId;ids:string[];open:(pair:TradingPair)=>void;remove:(id:string)=>void}){
  const catalog=useMarketResource<TradingPair[]>(`/api/market/pairs?exchange=${exchange}&quote=all`);
  return <>{ids.map(id=>{
    const pair=catalog.data?.find(pair=>favoriteKey(pair)===id);
    return <div className="saved-market-row" key={id}><button disabled={!pair} onClick={()=>pair&&open(pair)} title={catalog.error||undefined}><strong>{pair?`${pair.baseAsset}/${pair.quoteAsset}`:id.split(":").slice(2).join(":")}</strong><small>{EXCHANGES[exchange].name} · Spot{!pair?catalog.error?" · ошибка загрузки":catalog.data?" · недоступна":" · загрузка…":""}</small></button><button aria-label={`Удалить ${id}`} onClick={()=>remove(id)}>×</button></div>;
  })}{catalog.error&&<button className="button" onClick={catalog.refresh}>Повторить загрузку {EXCHANGES[exchange].name}</button>}</>;
}

export function SavedMarkets({mode,open}:{mode:"favorites"|"recent";open:(pair:TradingPair)=>void}){
  const preferences=useWorkspacePreferences(),settings=preferences.settings;
  if(mode==="recent")return <div className="pair-list" aria-label="История просмотров"><button className="button" disabled={!settings.recentPairs.length} onClick={()=>preferences.update({recentPairs:[]})}>Очистить историю</button>{settings.recentPairs.map(pair=><SavedRow key={favoriteKey(pair)} id={favoriteKey(pair)} open={open} remove={()=>preferences.update({recentPairs:settings.recentPairs.filter(other=>favoriteKey(other)!==favoriteKey(pair))})}/>)}{!settings.recentPairs.length&&<div className="empty-list">История просмотров пуста</div>}</div>;
  const remove=(id:string)=>preferences.update({marketPanel:{...settings.marketPanel,favorites:settings.marketPanel.favorites.filter(key=>key!==id)}});
  return <div className="pair-list" aria-label="Избранные пары">{EXCHANGE_IDS.map(exchange=>{const ids=settings.marketPanel.favorites.filter(id=>id.startsWith(`${exchange}:spot:`));return ids.length?<SavedGroup key={exchange} exchange={exchange} ids={ids} open={open} remove={remove}/>:null;})}{!settings.marketPanel.favorites.length&&<div className="empty-list">Добавьте пары звёздочкой в списке рынков</div>}</div>;
}
