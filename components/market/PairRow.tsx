"use client";
import {memo} from "react";
import {percent,price} from "@/lib/market/format";
import type {Ticker,TradingPair} from "@/lib/market/types";
import {Star} from "lucide-react";
import {CoinIcon} from "./CoinIcon";
export const PairRow=memo(function PairRow({pair,ticker,livePrice,active,select,favorite,toggleFavorite}:{pair:TradingPair;ticker?:Ticker;livePrice?:number;active:boolean;select:(pair:TradingPair)=>void;favorite:boolean;toggleFavorite:(pair:TradingPair)=>void}){
  return <div className={`pair-row ${active?"active":""}`}>
    <button className={`pair-favorite ${favorite?"selected":""}`} onClick={()=>toggleFavorite(pair)} aria-label={`${favorite?"Убрать":"Добавить"} ${pair.baseAsset}/${pair.quoteAsset} ${favorite?"из избранного":"в избранное"}`} aria-pressed={favorite}><Star size={12} fill={favorite?"currentColor":"none"}/></button>
    <button className="pair-select" onClick={()=>select(pair)} aria-pressed={active}>
    <span className="pair-name"><CoinIcon asset={pair.baseAsset} small/><strong>{pair.baseAsset}<span>/{pair.quoteAsset}</span></strong></span>
    <span className="pair-numbers"><strong>{price(livePrice??ticker?.lastPrice)}</strong><small className={ticker?.priceChangePercent24h==null?"muted":ticker.priceChangePercent24h<0?"negative":"positive"}>{percent(ticker?.priceChangePercent24h)}</small></span>
    </button>
  </div>;
});
