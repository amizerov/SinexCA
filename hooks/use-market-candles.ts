"use client";
import { useCallback, useEffect, useState,useMemo } from "react";
import { getMarket, isPermanentError } from "@/lib/market/client";
import { mergeCandles } from "@/lib/market/normalize";
import { subscribeMarketStream } from "@/lib/market/stream";
import { EXCHANGES } from "@/lib/market/exchange-config";
import { streamFreshnessMs } from "@/lib/market/stream-health";
import type { Candle, ExchangeId, StreamStatus, Timeframe, TradingPair } from "@/lib/market/types";
import {intervalSeconds} from "@/lib/market/intervals";

interface CandleState { key: string; candles: Candle[]; loading: boolean; status: StreamStatus; error?: string; updatedAt?: number; lastStreamAt?:number; livePrice?: number }
export function useMarketCandles(exchange: ExchangeId, pair: TradingPair | undefined, timeframe: Timeframe,warmup=false,dailySession=false) {
  const historyLimit=warmup?1000:500;
  const streamLimit=dailySession?historyLimit+Math.ceil(86400/intervalSeconds(timeframe)):historyLimit;
  const symbol = pair?.symbol;
  const wsSymbol = pair ? `${pair.baseAsset}/${pair.quoteAsset}` : undefined;
  const key = `${exchange}:${symbol}:${timeframe}`;
  const [state, setState] = useState<CandleState>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    let fetching = false, stopPolling = false, needsHistory = true;
    let streamStatus: StreamStatus = "connecting";
    let lastStreamData = 0;
    let buffer: Candle[] = [];
    const patch = (value: Partial<CandleState>) => {
      if (!controller.signal.aborted) setState(old => ({ key, candles: [], loading: true, status: "connecting", ...(old?.key === key ? old : {}), ...value }));
    };
    async function load() {
      if (fetching || controller.signal.aborted || stopPolling) return;
      fetching = true; buffer = [];
      try {
        const history = await getMarket<Candle[]>(`/api/market/candles?exchange=${exchange}&symbol=${symbol}&timeframe=${timeframe}&limit=${historyLimit}`, controller.signal);
        needsHistory = false;
        if (!controller.signal.aborted) setState(old=>({...old?.key===key?old:{},key,candles:mergeCandles(dailySession&&old?.key===key?old.candles:[],mergeCandles(history,buffer,streamLimit),streamLimit),loading:false,status:old?.key===key?old.status:"connecting",lastStreamAt:old?.key===key?old.lastStreamAt:undefined,error:undefined,updatedAt:Date.now()}));
      } catch (error) {
        needsHistory = true;
        if (!controller.signal.aborted) patch({ loading: false, error: error instanceof Error ? error.message : "Ошибка загрузки свечей" });
        stopPolling = isPermanentError(error);
      } finally { fetching = false; buffer = []; }
    }
    const stopStream = subscribeMarketStream(exchange, { symbol, timeframe, wsSymbol,
      onCandle: candle => {
        lastStreamData = Date.now();
        patch({lastStreamAt:lastStreamData});
        if (fetching) buffer = mergeCandles(buffer, [candle], streamLimit);
        if (!controller.signal.aborted) setState(old => {
          if (!old || old.key !== key || old.candles.length === 0) return old;
          return { ...old, candles: mergeCandles(old.candles, [candle],streamLimit), updatedAt: Date.now(),lastStreamAt:lastStreamData };
        });
      },
      onPrice: price => { lastStreamData = Date.now(); patch({ livePrice: price,lastStreamAt:lastStreamData }); },
      onStatus: status => { streamStatus = status; patch({ status }); },
      onReconnect: () => { void load(); },
    });
    void Promise.resolve().then(() => { patch({ error: undefined }); return load(); });
    // A live stream does not repair a failed history request or fill missing candles.
    const fallback = setInterval(() => { if ((needsHistory || !EXCHANGES[exchange].candleStream || streamStatus !== "live" || Date.now() - lastStreamData > streamFreshnessMs(exchange)) && !document.hidden) void load(); }, 15_000);
    return () => { controller.abort(); stopStream(); clearInterval(fallback); };
  }, [exchange, symbol, wsSymbol, timeframe, key, revision,historyLimit,streamLimit,dailySession]);
  const current: CandleState = state?.key === key ? state : { key, candles: [], loading: !!symbol, status: "connecting" };
  const visible=useMemo(()=>current.candles.slice(-500),[current.candles]);
  return { ...current,history:current.candles,candles:visible, refresh };
}
