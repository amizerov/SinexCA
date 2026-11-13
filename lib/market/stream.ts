import { z } from "zod";
import { finiteNumber } from "./schemas";
import type { Candle, ExchangeId, StreamStatus, Timeframe } from "./types";
import { normalizeCandles } from "./normalize";
import { subscribeExtraStream } from "./extra-streams";
import { StreamHealth,streamFreshnessMs } from "./stream-health";
import { INTERVAL_MINUTES,wsInterval } from "./intervals";
import {venueCandleSettings,decodeVenueCandle} from "./venue-streams";

const eventSchema = z.object({ e: z.literal("kline"), s: z.string(), k: z.object({
  t: z.number().int().nonnegative(), i: z.string(), o: finiteNumber, h: finiteNumber,
  l: finiteNumber, c: finiteNumber, v: finiteNumber,
}) });
export function decodeKline(input: unknown, symbol: string, timeframe: Timeframe): Candle | null {
  const result = eventSchema.safeParse(input);
  if (!result.success || result.data.s !== symbol || result.data.k.i !== timeframe) return null;
  const k = result.data.k;
  if (Math.min(k.o, k.h, k.l, k.c) <= 0 || k.v < 0 || k.h < Math.max(k.o, k.c) || k.l > Math.min(k.o, k.c) || k.h < k.l) return null;
  return { time: Math.floor(k.t / 1000), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v };
}
export interface CandleStreamOptions {
  symbol: string; timeframe: Timeframe;
  wsSymbol?: string;
  onPrice?: (price: number) => void;
  onCandle: (candle: Candle) => void;
  onStatus: (status: StreamStatus) => void;
  onReconnect: () => void;
  onConnection?: (event:"open"|"message"|"subscribed"|"close")=>void;
}
export interface CandleStreamAdapter { subscribe(options: CandleStreamOptions): () => void }
export const binanceCandleStream: CandleStreamAdapter = {
  subscribe({ symbol, timeframe, onCandle, onStatus, onReconnect,onConnection }) {
    let stopped = false, attempts = 0, connectedBefore = false;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    function connect() {
      if (stopped) return;
      onStatus(connectedBefore || attempts ? "reconnecting" : "connecting");
      const ws = new WebSocket(`wss://data-stream.binance.vision:443/ws/${symbol.toLowerCase()}@kline_${timeframe}`);
      socket = ws;
      const armWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => ws.close(), 20_000);
      };
      armWatchdog();
      ws.onopen = () => { if (stopped) return; onConnection?.("open");armWatchdog(); };
      ws.onmessage = event => {
        if (stopped) return;
        onConnection?.("message");
        try {
          const candle = decodeKline(JSON.parse(String(event.data)), symbol, timeframe);
          if (!candle) return;
          armWatchdog();
          if (attempts > 0) onReconnect();
          attempts = 0; connectedBefore = true;
          onStatus("live"); onCandle(candle);
        } catch { /* Malformed messages never enter chart state. */ }
      };
      ws.onerror = () => {ws.onerror=null;ws.close();};
      ws.onclose = () => {
        onConnection?.("close");
        clearTimeout(watchdog);
        if (stopped) return;
        attempts += 1;
        if (attempts > 7) { onStatus("offline"); return; }
        onStatus("reconnecting");
        retryTimer = setTimeout(connect, Math.min(30_000, 750 * 2 ** (attempts - 1)) + Math.random() * 300);
      };
    }
    connect();
    return () => {
      stopped = true; clearTimeout(retryTimer); clearTimeout(watchdog);
      if (socket) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
    };
  },
};

const minutes=INTERVAL_MINUTES;
export function streamSettings(exchange: ExchangeId, { symbol, timeframe, wsSymbol }: Pick<CandleStreamOptions, "symbol" | "timeframe" | "wsSymbol">):{url:string;message:Record<string,unknown>;ping?:string;subscribeDelayMs?:number;reply?:(input:unknown)=>unknown} {
  const bar = wsInterval(exchange,timeframe);
  switch (exchange) {
    case "whitebit":case "cryptocom":return venueCandleSettings(exchange,{symbol,timeframe});
    case "bybit": return { url: "wss://stream.bybit.com/v5/public/spot", message: { op: "subscribe", args: [`kline.${bar}.${symbol}`] }, ping: JSON.stringify({ op: "ping" }) };
    case "okx": return { url: "wss://ws.okx.com:8443/ws/v5/business", message: { op: "subscribe", args: [{ channel: `candle${bar}`, instId: symbol }] }, ping: "ping" };
    case "bitget": return { url: "wss://ws.bitget.com/v2/ws/public", message: { op: "subscribe", args: [{ instType: "SPOT", channel: `candle${bar}`, instId: symbol }] }, ping: "ping" };
    case "gate": return { url: "wss://api.gateio.ws/ws/v4/", message: { time: Math.floor(Date.now() / 1000), channel: "spot.candlesticks", event: "subscribe", payload: [bar, symbol] } };
    case "kraken": return { url: "wss://ws.kraken.com/v2", message: { method: "subscribe", params: { channel: "ohlc", symbol: [wsSymbol], interval: minutes[timeframe] } } };
    case "coinbase": return { url: "wss://ws-feed.exchange.coinbase.com", message: { type: "subscribe", product_ids: [symbol], channels: ["ticker", "heartbeat"] } };
    case "bingx": return {url:"wss://open-api-ws.bingx.com/market",message:{id:crypto.randomUUID(),reqType:"sub",dataType:`${symbol}@kline_${bar}`},reply(input){const event=envelope.parse(input);return event.ping?{pong:event.ping,time:event.time}:undefined;}};
    default: throw new Error("Используйте нативный адаптер Binance");
  }
}
const envelope = z.record(z.string(), z.unknown());
export function decodeForeignStream(exchange: ExchangeId, input: unknown, options: Pick<CandleStreamOptions, "symbol" | "timeframe" | "wsSymbol">): { candle?: Candle; price?: number } {
  const x = envelope.parse(input), { symbol, timeframe, wsSymbol } = options;
  if(exchange==="whitebit"||exchange==="cryptocom")return {candle:decodeVenueCandle(exchange,input,options)};
  let rows: unknown[][] = [];
  if (exchange === "coinbase") {
    if (x.type === "ticker" && x.product_id === symbol) return { price: finiteNumber.pipe(z.number().positive()).parse(x.price) };
    return {};
  }
  if(exchange==="bingx"){
    if(x.dataType!==`${symbol}@kline_${wsInterval(exchange,timeframe)}`)return {};
    const data=envelope.parse(x.data),k=envelope.parse(data.K);
    if(data.s!==symbol)return {};
    rows=[[k.t,k.o,k.h,k.l,k.c,k.v]];
  }
  if (exchange === "bybit") {
    if (x.topic !== `kline.${wsInterval(exchange,timeframe)}.${symbol}`) return {};
    rows = z.array(envelope).parse(x.data).map(r => [r.start, r.open, r.high, r.low, r.close, r.volume]);
  } else if (exchange === "okx" || exchange === "bitget") {
    const arg = envelope.safeParse(x.arg);
    const settings = streamSettings(exchange, options);
    const request = envelope.parse(settings.message);
    const expected = z.array(envelope).parse(request.args)[0];
    if (!arg.success || arg.data.instId !== symbol || arg.data.channel !== expected.channel || !Array.isArray(x.data)) return {};
    rows = z.array(z.array(z.unknown())).parse(x.data);
  } else if (exchange === "gate") {
    if (x.channel !== "spot.candlesticks" || x.event !== "update") return {};
    const r = envelope.parse(x.result);
    if (r.n !== `${wsInterval(exchange,timeframe)}_${symbol}`) return {};
    rows = [[Number(r.t) * 1000, r.o, r.h, r.l, r.c, r.a]]; // 'v' is quote turnover; 'a' is base volume.
  } else if (exchange === "kraken") {
    if (x.channel !== "ohlc") return {};
    rows = z.array(envelope).parse(x.data).filter(r => r.symbol === wsSymbol && r.interval === minutes[timeframe]).map(r => [Date.parse(String(r.interval_begin)), r.open, r.high, r.low, r.close, r.volume]);
  }
  return { candle: normalizeCandles(rows).at(-1) };
}
export function subscribeMarketStream(exchange: ExchangeId, options: CandleStreamOptions): () => void {
  if(exchange!=="coinbase"&&!wsInterval(exchange,options.timeframe)){options.onStatus("offline");return()=>{};}
  const health=new StreamHealth(exchange);let status:StreamStatus="connecting",openedAt=0;
  const emit=(next:StreamStatus)=>{if(next!==status){status=next;options.onStatus(next);}};
  options.onStatus("connecting");
  const market=()=>{health.market(Date.now());emit("live");};
  const stop=subscribeRawMarketStream(exchange,{...options,
    onConnection:event=>{options.onConnection?.(event);if(event==="open"){openedAt=Date.now();health.open(openedAt);}else if(event==="message")health.transport(Date.now());else if(event==="subscribed")health.acknowledge();else health.close();},
    onStatus:next=>{if(next!=="live")emit(next);},
    onCandle:candle=>{market();options.onCandle(candle);},onPrice:price=>{market();options.onPrice?.(price);}});
  const timer=setInterval(()=>{if(health.connected && !health.fresh(Date.now()) && Date.now()-openedAt>streamFreshnessMs(exchange))emit("stale");},1000);
  return()=>{clearInterval(timer);stop();};
}
function subscribeRawMarketStream(exchange: ExchangeId, options: CandleStreamOptions): () => void {
  if (exchange === "binance") return binanceCandleStream.subscribe(options);
  if (exchange === "kucoin" || exchange === "bitfinex" || exchange === "htx" || exchange === "mexc") return subscribeExtraStream(exchange, options);
  const settings = streamSettings(exchange, options);
  let stopped = false, attempts = 0, hadData = false;
  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let subscriptionTimer: ReturnType<typeof setTimeout> | undefined;
  let queue=Promise.resolve();
  function connect() {
    if (stopped) return;
    options.onStatus(attempts || hadData ? "reconnecting" : "connecting");
    const ws = new WebSocket(settings.url); socket = ws;ws.binaryType="arraybuffer";
    const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), 90_000); };
    arm();
    ws.onopen = () => {
      if (stopped) return;
      options.onConnection?.("open");
      subscriptionTimer=setTimeout(()=>{if(!stopped&&socket===ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(settings.message));},settings.subscribeDelayMs||0);
      if (settings.ping) heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(settings.ping!); }, 15000);
    };
    ws.onmessage = event => {queue=queue.then(async()=>{
      if (stopped||socket!==ws) return;
      options.onConnection?.("message");arm();
      try {
        let text:string;
        if(event.data instanceof ArrayBuffer){const stream=new Blob([event.data]).stream();text=await new Response(exchange==="bingx"?stream.pipeThrough(new DecompressionStream("gzip")):stream).text();}
        else text=String(event.data);
        const input = JSON.parse(text);
        if(input.error||typeof input.code==="number"&&input.code!==0){ws.close();return;}
        const reply=settings.reply?.(input);if(reply!==undefined&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(reply));
        if (input.event === "error" || input.success === false || input.type === "error") { ws.close(); return; }
        if(input.event==="subscribe" || input.type==="subscriptions" || input.success===true || (input.method==="subscribe"&&input.success===true) || (input.event==="subscribe"&&input.result?.status==="success")) options.onConnection?.("subscribed");
        const { candle, price } = decodeForeignStream(exchange, input, options);
        if (!candle && price === undefined) return;
        if (attempts > 0) options.onReconnect();
        attempts = 0; hadData = true; options.onStatus("live");
        if (candle) options.onCandle(candle);
        if (price !== undefined) options.onPrice?.(price);
      } catch { /* Control messages and invalid market payloads never enter chart state. */ }
    }).catch(()=>{});};
    ws.onerror = () => {ws.onerror=null;ws.close();};
    ws.onclose = () => {
      options.onConnection?.("close");
      clearTimeout(subscriptionTimer); clearTimeout(watchdog); clearInterval(heartbeat);
      if (stopped) return;
      attempts++;
      if (attempts > 7) { options.onStatus("offline"); return; }
      options.onStatus("reconnecting");
      retryTimer = setTimeout(connect, Math.min(30_000, 750 * 2 ** (attempts - 1)) + Math.random() * 300);
    };
  }
  connect();
  return () => {
    stopped = true; clearTimeout(subscriptionTimer); clearTimeout(retryTimer); clearTimeout(watchdog); clearInterval(heartbeat);
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
  };
}
