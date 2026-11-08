import { wsInterval } from "./intervals";
import { z } from "zod";
import type { Candle } from "./types";
import type { CandleStreamOptions } from "./stream";
import { extraCandles, type ExtraId } from "./exchanges/extra-normalize";
import { aggregateCandles, record } from "./exchanges/foreign-normalize";
import { mergeCandles } from "./normalize";
import { decodeMexcKline, MEXC_STREAM_INTERVALS } from "./mexc-protobuf";
export function createExtraDecoder(exchange: ExtraId, options: CandleStreamOptions) {
  const { symbol, timeframe } = options;
  let channel: number | undefined, hours: Candle[] = [];
  return (input: unknown): Candle | undefined => {
    if (exchange === "mexc") return input instanceof ArrayBuffer ? decodeMexcKline(new Uint8Array(input), symbol, timeframe) : undefined;
    if (exchange === "bitfinex") {
      if (input && typeof input === "object" && !Array.isArray(input)) {
        const event = record.parse(input);
        if (event.event === "subscribed" && event.channel === "candles" && event.key === `trade:${wsInterval("bitfinex",timeframe)}:${symbol}`) channel = z.number().parse(event.chanId);
        return;
      }
      if (!Array.isArray(input) || input[0] !== channel || !Array.isArray(input[1])) return;
      const rows = Array.isArray(input[1][0]) ? input[1] : [input[1]];
      const candles = extraCandles("bitfinex", rows);
      if (timeframe !== "4h") return candles.at(-1);
      hours = mergeCandles(hours, candles, 250);
      return aggregateCandles(hours, 14400).at(-1);
    }
    const event = record.parse(input);
    if (exchange === "htx") {
      if (event.ch !== `market.${symbol}.kline.${wsInterval("htx",timeframe)}` || !event.tick) return;
      return extraCandles("htx", { status: "ok", data: [event.tick] })[0];
    }
    if (event.type !== "message" || event.topic !== `/market/candles:${symbol}_${wsInterval("kucoin",timeframe)}`) return;
    const data = record.parse(event.data);
    if (data.symbol !== symbol) return;
    return extraCandles("kucoin", { code: "200000", data: [data.candles] })[0];
  };
}
export function subscribeExtraStream(exchange: ExtraId, options: CandleStreamOptions) {
  let stopped = false, attempts = 0, hadData = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const controller = new AbortController();
  async function connect() {
    if (stopped) return;
    options.onStatus(attempts || hadData ? "reconnecting" : "connecting");
    try {
      let url: string, subscription: object, pingInterval = 15000, ping: object | undefined;
      const { symbol, timeframe } = options;
      if (exchange === "kucoin") {
        const response = await fetch("/api/market/kucoin-token", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), cache: "no-store" });
        if (!response.ok) throw new Error("KuCoin token unavailable");
        const { data } = await response.json();
        const token = z.object({ endpoint: z.string().url(), token: z.string().min(1), pingInterval: z.number().positive() }).parse(data);
        const endpoint = new URL(token.endpoint);
        if (endpoint.protocol !== "wss:" || endpoint.hostname !== "ws-api-spot.kucoin.com") throw new Error("Invalid KuCoin endpoint");
        endpoint.search = new URLSearchParams({ token: token.token, connectId: crypto.randomUUID() }).toString();
        url = endpoint.toString(); pingInterval = Math.min(15000, token.pingInterval * .7);
        subscription = { id: crypto.randomUUID(), type: "subscribe", topic: `/market/candles:${symbol}_${wsInterval("kucoin",timeframe)}`, privateChannel: false, response: true };
        ping = { id: "sinex-ping", type: "ping" };
      } else if (exchange === "bitfinex") {
        url = "wss://api-pub.bitfinex.com/ws/2";
        subscription = { event: "subscribe", channel: "candles", key: `trade:${wsInterval("bitfinex",timeframe)}:${symbol}` };
      } else if (exchange === "htx") {
        url = "wss://api.huobi.pro/ws";
        subscription = { sub: `market.${symbol}.kline.${wsInterval("htx",timeframe)}`, id: "sinex" };
      } else {
        url = "wss://wbs-api.mexc.com/ws";
        subscription = { method: "SUBSCRIPTION", params: [`spot@public.kline.v3.api.pb@${symbol}@${MEXC_STREAM_INTERVALS[timeframe]}`] };
        ping = { method: "PING" };
      }
      if (stopped) return;
      const ws = new WebSocket(url); ws.binaryType = "arraybuffer"; socket = ws;
      const decode = createExtraDecoder(exchange, options);
      const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), 90000); };
      let messages = Promise.resolve(); arm();
      ws.onopen = () => {
        if (stopped) return;
        options.onConnection?.("open");
        ws.send(JSON.stringify(subscription));
        if (ping) heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ping)); }, pingInterval);
      };
      ws.onmessage = event => {
        const raw: string | ArrayBuffer = event.data;
        messages = messages.then(async () => {
          if (stopped || socket !== ws) return;
          options.onConnection?.("message");
          arm();
          let input: unknown;
          if (typeof raw === "string") input = JSON.parse(raw);
          else if (exchange === "htx") {
            const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
            input = JSON.parse(await new Response(stream).text());
          } else input = raw;
          if (stopped || socket !== ws) return;
          if(input && typeof input==="object" && !Array.isArray(input) && ("subbed" in input || ("event" in input&&input.event==="subscribed") || ("type" in input&&input.type==="ack"))) options.onConnection?.("subscribed");
          if (exchange === "htx" && input && typeof input === "object" && "ping" in input) { ws.send(JSON.stringify({ pong: input.ping })); return; }
          const candle = decode(input);
          if (!candle) return;
          if (attempts > 0) options.onReconnect();
          attempts = 0; hadData = true; options.onStatus("live"); options.onCandle(candle);
        }).catch(() => { /* Ignore malformed frames without allowing them into chart state. */ });
      };
      ws.onerror = () => {ws.onerror=null;ws.close();};
      ws.onclose = () => { options.onConnection?.("close");clearTimeout(watchdog); clearInterval(heartbeat); schedule(); };
    } catch { schedule(); }
  }
  function schedule() {
    if (stopped) return;
    attempts++;
    if (attempts > 7) { options.onStatus("offline"); return; }
    options.onStatus("reconnecting");
    retry = setTimeout(() => { void connect(); }, Math.min(30000, 750 * 2 ** (attempts - 1)) + Math.random() * 300);
  }
  void connect();
  return () => {
    stopped = true; controller.abort(); clearTimeout(retry); clearTimeout(watchdog); clearInterval(heartbeat);
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
  };
}
