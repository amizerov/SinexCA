import type {TradingPair} from "../types";
import type {OrderBook} from "./model";
import {object} from "./model";
import {bookProtocol,BOOK_STREAM_EXCHANGES} from "./protocols";
export function subscribeBook(pair:TradingPair,onBook:(book:OrderBook)=>void,onStatus:(live:boolean)=>void){
  if(!BOOK_STREAM_EXCHANGES.includes(pair.exchange))return ()=>{};
  const controller=new AbortController();let stopped=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,ping:ReturnType<typeof setInterval>|undefined,watch:ReturnType<typeof setInterval>|undefined,flush:ReturnType<typeof setTimeout>|undefined,attempt=0,pending:OrderBook|undefined;
  let subscriptionTimer:ReturnType<typeof setTimeout>|undefined;
  function schedule(){if(stopped)return;onStatus(false);retry=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(attempt++,5)));}
  const send=(ws:WebSocket,value:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(typeof value==="string"?value:JSON.stringify(value));};
  async function connect(){
    if(stopped)return;
    try{
      const protocol=await bookProtocol(pair,controller.signal);if(stopped||!protocol)return;
      const ws=new WebSocket(protocol.url);socket=ws;ws.binaryType="arraybuffer";let lastData=Date.now(),queue=Promise.resolve();
      watch=setInterval(()=>{if(Date.now()-lastData>5000)onStatus(false);if(Date.now()-lastData>30000)ws.close();},1000);
      ws.onopen=()=>{if(stopped)return;subscriptionTimer=setTimeout(()=>{if(stopped||socket!==ws)return;for(const message of protocol.subscriptions)send(ws,message);},protocol.subscribeDelayMs||0);if(protocol.ping)ping=setInterval(()=>send(ws,protocol.ping),protocol.pingMs||15000);};
      ws.onmessage=event=>{queue=queue.then(async()=>{
        if(stopped||socket!==ws)return;let input:unknown=event.data;
        if(input instanceof ArrayBuffer&&(pair.exchange==="htx"||pair.exchange==="bingx"))input=await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
        if(input==="pong")return;if(input==="ping"){send(ws,"pong");return;}
        if(typeof input==="string")input=JSON.parse(input);
        if(stopped||socket!==ws)return;const envelope=object(input);
        if(envelope.event==="error"||envelope.type==="error"||envelope.success===false||envelope.status==="error"||(typeof envelope.code==="number"&&envelope.code!==0)||envelope.error){ws.close();return;}
        const reply=protocol.reply?.(input);if(reply!==undefined)send(ws,reply);
        const book=protocol.decode(input);if(!book)return;
        if(book.exchangeTime&&(book.exchangeTime>Date.now()+60000||Date.now()-book.exchangeTime>30000))return;
        lastData=Date.now();attempt=0;pending=book;onStatus(true);
        if(!flush)flush=setTimeout(()=>{flush=undefined;if(!stopped&&socket===ws&&pending){onBook(pending);pending=undefined;}},100);
      }).catch(()=>{if(!stopped&&socket===ws)ws.close();});};
      ws.onerror=()=>ws.close();
      ws.onclose=()=>{if(socket===ws)socket=undefined;clearTimeout(subscriptionTimer);clearInterval(ping);clearInterval(watch);clearTimeout(flush);flush=undefined;pending=undefined;schedule();};
    }catch{schedule();}
  }
  void connect();
  return()=>{stopped=true;controller.abort();clearTimeout(subscriptionTimer);clearTimeout(retry);clearTimeout(flush);clearInterval(ping);clearInterval(watch);if(socket){socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;socket.close();}};
}
