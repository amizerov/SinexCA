"use client";
import { useState } from "react";
import { sortPairs,type PairSort } from "@/lib/market/sort-pairs";
import type { Ticker,TradingPair } from "@/lib/market/types";

/** Prices remain live, while row positions change only when the user changes sorting or exchange. */
export function usePairOrder(key:string,pairs:TradingPair[]|undefined,tickers:Map<string,Ticker>,sort:PairSort,ready:boolean){
  const [snapshot,setSnapshot]=useState<{key:string;symbols:string[]}>();
  const orderKey=`${key}:${sort}:${pairs?.map(pair=>pair.symbol).join(",")||""}`;
  if(ready&&pairs&&snapshot?.key!==orderKey){
    setSnapshot({key:orderKey,symbols:sortPairs(pairs,tickers,sort).map(pair=>pair.symbol)});
  }
  if(!ready||snapshot?.key!==orderKey)return [];
  const bySymbol=new Map(pairs?.map(pair=>[pair.symbol,pair]));
  return snapshot.symbols.flatMap(symbol=>{const pair=bySymbol.get(symbol);return pair?[pair]:[];});
}
