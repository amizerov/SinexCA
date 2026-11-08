import type {ExchangeId,TradingPair,StreamStatus} from "../types";
import {tradeFactories} from "./registry";
import {record,type TradeTick} from "./types";
export interface TradeStreamOptions {onTicks:(ticks:TradeTick[])=>void;onTrades?:(ticks:TradeTick[])=>void;onStatus:(status:StreamStatus)=>void;onReconnect?:()=>void}
/** Trade subscription for the supplied instruments; the terminal supplies only its selected pair. */
export function subscribeTrades(exchange:ExchangeId,pairs:TradingPair[],options:TradeStreamOptions){
  const controller=new AbortController(),allowed=new Set(pairs.map(pair=>pair.symbol));
  let socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,ping:ReturnType<typeof setInterval>|undefined,watch:ReturnType<typeof setInterval>|undefined,flush:ReturnType<typeof setTimeout>|undefined;
  let attempts=0,hadData=false,status:StreamStatus="connecting",lastData=0,lastTransport=0,stopped=false;
  let subscriptionTimer:ReturnType<typeof setTimeout>|undefined;
  const latest=new Map<string,TradeTick>(),pending=new Map<string,TradeTick>();
  let tape:TradeTick[]=[];
  const emit=(value:StreamStatus)=>{if(status!==value){status=value;options.onStatus(value);}};
  const send=(ws:WebSocket,message:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(typeof message==="string"?message:JSON.stringify(message));};
  function drain(){flush=undefined;if(stopped)return;if(tape.length){const trades=tape;tape=[];options.onTrades?.(trades);}if(pending.size){const ticks=[...pending.values()];pending.clear();options.onTicks(ticks);}}
  function accept(ticks:TradeTick[]){
    const now=Date.now();let accepted=false;
    for(const tick of ticks){if(!allowed.has(tick.symbol)||tick.time>now+60000||now-tick.time>86400000)continue;if(options.onTrades)tape.push(tick);if(now-tick.time>60000)continue;const previous=latest.get(tick.symbol);if(previous&&tick.time<previous.time)continue;latest.set(tick.symbol,tick);pending.set(tick.symbol,tick);accepted=true;}
    if(tape.length>2000)tape=tape.slice(-2000);if(tape.length&&!flush)flush=setTimeout(drain,50);
    if(!accepted)return;lastData=now;
    if(!hadData||attempts){if(hadData)options.onReconnect?.();hadData=true;attempts=0;}
    emit("live");if(!flush)flush=setTimeout(drain,50);
  }
  async function connect(){
    if(stopped)return;emit(hadData||attempts?"reconnecting":"connecting");
    try{
      const protocol=await tradeFactories[exchange](pairs,controller.signal);if(stopped)return;
      const ws=new WebSocket(protocol.url);socket=ws;ws.binaryType="arraybuffer";lastTransport=Date.now();const openedAt=lastTransport;lastData=0;let queue=Promise.resolve();
      watch=setInterval(()=>{const now=Date.now();if(now-(lastData||openedAt)>20000)emit("stale");if(now-lastTransport>45000||now-(lastData||openedAt)>45000)ws.close();},1000);
      ws.onopen=()=>{if(stopped||socket!==ws)return;subscriptionTimer=setTimeout(()=>{if(stopped||socket!==ws)return;for(const subscription of protocol.subscriptions)send(ws,subscription);},protocol.subscribeDelayMs||0);if(protocol.ping)ping=setInterval(()=>send(ws,protocol.ping),protocol.pingMs||15000);};
      ws.onmessage=event=>{
        if(stopped||socket!==ws)return;lastTransport=Date.now();
        queue=queue.then(async()=>{
          if(stopped||socket!==ws)return;let input:unknown=event.data;
          if(input instanceof ArrayBuffer&&exchange==="htx")input=await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
          if(typeof input==="string"){if(input==="pong"||input==="ping")return;input=JSON.parse(input);}
          if(stopped||socket!==ws)return;const envelope=record(input);
          if(envelope.event==="error"||envelope.type==="error"||envelope.success===false||(typeof envelope.code==="number"&&envelope.code!==0)||(envelope.error&&typeof envelope.error==="object")){ws.close();return;}
          const reply=protocol.reply?.(input);if(reply!==undefined)send(ws,reply);accept(protocol.decode(input));
        }).catch(()=>{/* Malformed or unrelated frames never enter prices. */});
      };
      ws.onerror=()=>{ws.onerror=null;ws.close();};
      ws.onclose=()=>{clearTimeout(subscriptionTimer);clearInterval(ping);clearInterval(watch);drain();if(!stopped)schedule();};
    }catch{if(!stopped)schedule();}
  }
  function schedule(){attempts++;if(attempts>8){emit("offline");return;}emit("reconnecting");retry=setTimeout(()=>void connect(),Math.min(30000,750*2**(attempts-1))+Math.random()*250);}
  options.onStatus("connecting");void connect();
  return()=>{stopped=true;controller.abort();clearTimeout(subscriptionTimer);clearTimeout(retry);clearTimeout(flush);clearInterval(ping);clearInterval(watch);if(socket){socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;socket.close();}};
}
