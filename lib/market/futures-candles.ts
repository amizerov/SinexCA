import type {CandleStreamOptions} from "./stream";
import type {Candle,ExchangeId} from "./types";
import {marketIntervalSpec} from "./market-type";
import {restInterval} from "./intervals";
import {record,rows} from "./trades/types";
import {normalizeCandles} from "./normalize";
import {kucoinFuturesConnection} from "./futures-kucoin";

interface Protocol {url:string;subscriptions:unknown[];ping?:unknown;pingMs?:number;reply?:(input:unknown)=>unknown;decode(input:unknown):Candle|undefined}
export async function futuresCandleProtocol(exchange:ExchangeId,options:CandleStreamOptions,signal:AbortSignal):Promise<Protocol>{
  const {symbol,timeframe}=options,bar=marketIntervalSpec(exchange,"futures",timeframe).rest,size=options.contractSize??1;
  const candle=(row:unknown[])=>normalizeCandles([row])[0];
  switch(exchange){
    case "bitget":return {url:"wss://ws.bitget.com/v2/ws/public",subscriptions:[{op:"subscribe",args:[{instType:"USDT-FUTURES",channel:`candle${bar}`,instId:symbol}]}],ping:"ping",decode(input){const x=record(input),arg=record(x.arg);if(arg.instId!==symbol||arg.channel!==`candle${bar}`)return;return normalizeCandles(rows(x.data)).at(-1);}};
    case "gate":return {url:"wss://fx-ws.gateio.ws/v4/ws/usdt",subscriptions:[{time:Math.floor(Date.now()/1000),channel:"futures.candlesticks",event:"subscribe",payload:[bar,symbol]}],ping:{channel:"futures.ping"},decode(input){const x=record(input);if(x.channel!=="futures.candlesticks"||x.event!=="update")return;const values=rows(x.result).map(record).filter(r=>r.n===`${bar}_${symbol}`).map(r=>[Number(r.t)*1000,r.o,r.h,r.l,r.c,Number(r.v)*size]);return normalizeCandles(values).at(-1);}};
    case "htx":return {url:"wss://api.hbdm.com/linear-swap-ws",subscriptions:[{sub:`market.${symbol}.kline.${bar}`,id:symbol}],reply(input){const x=record(input);return typeof x.ping==="number"?{pong:x.ping}:undefined;},decode(input){const x=record(input),r=record(x.tick);if(x.ch!==`market.${symbol}.kline.${bar}`)return;return candle([Number(r.id)*1000,r.open,r.high,r.low,r.close,r.amount]);}};
    case "mexc":return {url:"wss://contract.mexc.com/edge",subscriptions:[{method:"sub.kline",param:{symbol,interval:bar}}],ping:{method:"ping"},decode(input){const x=record(input),r=record(x.data);if(x.channel!=="push.kline"||x.symbol!==symbol||r.interval!==bar)return;return candle([Number(r.t)*1000,r.o,r.h,r.l,r.c,Number(r.q)*size]);}};
    case "kucoin":{const interval=restInterval("kucoin",timeframe),topic=`/contractMarket/limitCandle:${symbol}_${interval}`;return {...await kucoinFuturesConnection(signal),subscriptions:[{id:crypto.randomUUID(),type:"subscribe",topic,privateChannel:false,response:true}],decode(input){const x=record(input),r=record(x.data),v=rows(r.candles);if(x.type!=="message"||x.topic!==topic||v.length<6)return;return candle([Number(v[0])*1000,v[1],v[3],v[4],v[2],Number(v[5])*size]);}};}
    case "bingx":return {url:"wss://open-api-swap.bingx.com/swap-market",subscriptions:[{id:crypto.randomUUID(),reqType:"sub",dataType:`${symbol}@kline_${bar}`}],reply(input){const x=record(input);return x.ping?{pong:x.ping}:undefined;},decode(input){const x=record(input),data=record(x.data),r=record(data.K??data.k);if(x.dataType!==`${symbol}@kline_${bar}`||data.s!==symbol)return;return candle([r.t,r.o,r.h,r.l,r.c,r.v]);}};
    default:throw new Error("Use native candle stream");
  }
}

export function subscribeFuturesCandles(exchange:ExchangeId,options:CandleStreamOptions){
  const controller=new AbortController();let socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,ping:ReturnType<typeof setInterval>|undefined,watch:ReturnType<typeof setInterval>|undefined,attempt=0,hadData=false;
  const send=(ws:WebSocket,value:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(typeof value==="string"?value:JSON.stringify(value));};
  const schedule=()=>{if(controller.signal.aborted)return;if(++attempt>8){options.onStatus("offline");return;}options.onStatus("reconnecting");retry=setTimeout(()=>void connect(),Math.min(30000,750*2**(attempt-1)));};
  async function connect(){
    if(controller.signal.aborted)return;options.onStatus(hadData||attempt?"reconnecting":"connecting");
    try{
      const protocol=await futuresCandleProtocol(exchange,options,controller.signal);if(controller.signal.aborted)return;
      const ws=new WebSocket(protocol.url);socket=ws;ws.binaryType="arraybuffer";let last=Date.now(),queue=Promise.resolve();
      watch=setInterval(()=>{if(Date.now()-last>30000)options.onStatus("stale");if(Date.now()-last>90000)ws.close();},1000);
      ws.onopen=()=>{if(controller.signal.aborted)return;for(const subscription of protocol.subscriptions)send(ws,subscription);if(protocol.ping)ping=setInterval(()=>send(ws,protocol.ping),protocol.pingMs??15000);};
      ws.onmessage=event=>{queue=queue.then(async()=>{
        if(controller.signal.aborted||socket!==ws)return;let input:unknown=event.data;
        if(input instanceof ArrayBuffer){const stream=new Blob([input]).stream();input=await new Response(exchange==="htx"||exchange==="bingx"?stream.pipeThrough(new DecompressionStream("gzip")):stream).text();}
        if(controller.signal.aborted||socket!==ws)return;
        if(input==="ping"||input==="Ping"){send(ws,input==="Ping"?"Pong":"pong");return;}if(input==="pong"||input==="Pong")return;
        if(typeof input==="string")input=JSON.parse(input);
        const x=record(input);if(x.event==="error"||x.success===false||x.error){ws.close();return;}
        const reply=protocol.reply?.(input);if(reply!==undefined)send(ws,reply);
        const candle=protocol.decode(input);if(!candle)return;
        if(hadData&&attempt)options.onReconnect();attempt=0;hadData=true;last=Date.now();options.onStatus("live");options.onCandle(candle);
      }).catch(()=>{/* Invalid frames never enter the chart. */});};
      ws.onerror=()=>ws.close();ws.onclose=()=>{clearInterval(ping);clearInterval(watch);schedule();};
    }catch{schedule();}
  }
  void connect();return()=>{controller.abort();clearTimeout(retry);clearInterval(ping);clearInterval(watch);if(socket){socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;socket.close();}};
}
