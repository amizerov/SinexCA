"use client";
import {useEffect,useRef,type RefObject} from "react";
import type {IChartApi,UTCTimestamp} from "lightweight-charts";
import type {Candle} from "@/lib/market/types";
import {useWorkspacePreferences} from "./use-workspace-preferences";

export function useChartViewport(chart:RefObject<IChartApi|null>,candles:Candle[],scope:string){
  const preferences=useWorkspacePreferences(),latest=useRef(preferences);
  useEffect(()=>{latest.current=preferences;},[preferences]);
  const initialized=useRef("");
  const owner=preferences.identity?.ownerId;
  useEffect(()=>{
    const instance=chart.current,key=`${owner}:${scope}`;
    if(!instance||!preferences.ready||!candles.length||initialized.current===key)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let pending:{from:number;to:number}|undefined;
    const save=()=>{
      if(!pending)return;
      const current=latest.current;
      if(current.identity?.ownerId!==owner)return;
      const views={...current.settings.chartViews};
      delete views[scope];views[scope]=pending;
      const bounded=Object.fromEntries(Object.entries(views).slice(-100));
      pending=undefined;current.update({chartViews:bounded});
    };
    const changed=()=>{
      const range=instance.timeScale().getVisibleRange();
      if(!range||typeof range.from!=="number"||typeof range.to!=="number"||range.to<=range.from)return;
      pending={from:range.from,to:range.to};clearTimeout(timer);timer=setTimeout(save,350);
    };
    const frame=requestAnimationFrame(()=>{
      const saved=latest.current.settings.chartViews[scope];
      instance.priceScale("right",0).applyOptions({autoScale:true});
      if(saved&&saved.to>=candles[0].time&&saved.from<=candles[candles.length-1].time){
        instance.timeScale().setVisibleRange({from:saved.from as UTCTimestamp,to:saved.to as UTCTimestamp});
      }else instance.timeScale().setVisibleLogicalRange({from:Math.max(0,candles.length-95),to:candles.length+5});
      instance.timeScale().subscribeVisibleTimeRangeChange(changed);
    });
    initialized.current=key;
    window.addEventListener("pagehide",save);
    // The parent may already have disposed this chart before cleanup runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return()=>{window.removeEventListener("pagehide",save);cancelAnimationFrame(frame);clearTimeout(timer);if(chart.current===instance)instance.timeScale().unsubscribeVisibleTimeRangeChange(changed);save();initialized.current="";};
    // Candle updates must not reset the viewport or resubscribe on every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chart,owner,scope,preferences.ready,candles.length>0]);
}
