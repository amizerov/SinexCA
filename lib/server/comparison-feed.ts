import "server-only";
import type {ExchangeId,TradingPair} from "@/lib/market/types";
import {getExchange} from "@/lib/market/service";
import {COMPARISON_ASSETS,QUOTE_MAX_AGE,fallbackComparisonPairs,pairForAsset,type ComparisonQuote,type VenueSnapshot} from "@/lib/market/comparison/model";
import {comparisonProtocol} from "@/lib/market/comparison/protocol";
import {getKucoinToken} from "@/lib/market/exchanges/kucoin";

type Listener=(snapshot:VenueSnapshot)=>void;
class VenueFeed {
  listeners=new Set<Listener>();
  private quotes=new Map<string,ComparisonQuote>();
  private pairs:TradingPair[];
  private catalogReady=false;
  private stopped=false;
  private status:VenueSnapshot["status"]="connecting";
  private error="";
  private pollTimer?:ReturnType<typeof setTimeout>;
  private retryTimer?:ReturnType<typeof setTimeout>;
  private pingTimer?:ReturnType<typeof setInterval>;
  private broadcastTimer?:ReturnType<typeof setInterval>;
  private ws?:WebSocket;
  private attempts=0;
  private connecting=false;
  private streamError="";
  constructor(readonly exchange:ExchangeId){this.pairs=fallbackComparisonPairs(exchange);}
  snapshot():VenueSnapshot{return {exchange:this.exchange,status:this.status,error:this.streamError||this.error,available:this.catalogReady?this.pairs.map(pair=>pair.baseAsset):[...this.quotes.keys()],quotes:[...this.quotes.values()]};}
  start(){this.broadcastTimer=setInterval(()=>this.emit(),1000);void this.connect();void this.poll();}
  private emit(){if(this.stopped)return;const snapshot=this.snapshot();for(const listener of this.listeners)listener(snapshot);}
  private async poll(){
    try{
      const adapter=getExchange(this.exchange),catalog=await adapter.getPairs();if(this.stopped)return;
      this.pairs=COMPARISON_ASSETS.flatMap(asset=>{const pair=pairForAsset(catalog,asset);return pair?[pair]:[];});this.catalogReady=true;
      if(!this.ws&&!this.connecting&&this.pairs.length&&!this.retryTimer)void this.connect();
      const allLive=this.pairs.length&&this.pairs.every(pair=>{const quote=this.quotes.get(pair.baseAsset);return quote?.source==="ws"&&Date.now()-quote.receivedAt<QUOTE_MAX_AGE;});
      if(!allLive&&this.pairs.length){
        const tickers=await adapter.getTickers(this.pairs.map(pair=>pair.symbol));if(this.stopped)return;
        const indexed=new Map(this.pairs.map(pair=>[pair.symbol,pair]));
        for(const ticker of tickers){
          const pair=indexed.get(ticker.symbol);if(!pair||ticker.exchange!==this.exchange)continue;
          const old=this.quotes.get(pair.baseAsset);if(old&&(old.source==="ws"&&Date.now()-old.receivedAt<QUOTE_MAX_AGE||old.receivedAt>=ticker.receivedAt))continue;
          const positive=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>0?value:null;
          const size=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0?value:null;
          const bid=positive(ticker.bid),ask=positive(ticker.ask);
          this.quotes.set(pair.baseAsset,{exchange:this.exchange,asset:pair.baseAsset,symbol:pair.symbol,bid:bid&&ask&&bid>ask?null:bid,ask:bid&&ask&&bid>ask?null:ask,bidSize:size(ticker.bidSize),askSize:size(ticker.askSize),last:positive(ticker.lastPrice),receivedAt:ticker.receivedAt,source:"rest"});
        }
      }
      this.error="";this.status=[...this.quotes.values()].some(q=>q.source==="ws"&&Date.now()-q.receivedAt<QUOTE_MAX_AGE)?"live":"rest";
    }catch(error){
      if(!this.stopped){const hasLiveStream=[...this.quotes.values()].some(q=>q.source==="ws"&&Date.now()-q.receivedAt<QUOTE_MAX_AGE);this.error=hasLiveStream?"":error instanceof Error?error.message:"Источник недоступен";if(!hasLiveStream)this.status="error";}
    }finally{if(!this.stopped){this.emit();this.pollTimer=setTimeout(()=>void this.poll(),5000);}}
  }
  private async connect(){
    if(this.stopped||this.connecting)return;this.connecting=true;
    let protocol;
    try{protocol=comparisonProtocol(this.exchange,this.pairs,this.exchange==="kucoin"?await getKucoinToken():undefined);}
    catch(error){this.connecting=false;this.streamError=error instanceof Error?`WebSocket: ${error.message}`:"WebSocket недоступен";this.scheduleReconnect();return;}
    this.connecting=false;if(this.stopped||!protocol)return;
    const ws=new WebSocket(protocol.url);ws.binaryType="arraybuffer";this.ws=ws;const openedAt=Date.now();let lastMessage=openedAt,lastData=0,queue=Promise.resolve();const subscriptionTimers:ReturnType<typeof setTimeout>[]=[];
    const send=(value:unknown)=>ws.send(typeof value==="string"?value:JSON.stringify(value));
    this.pingTimer=setInterval(()=>{if(Date.now()-lastMessage>45000||Date.now()-(lastData||openedAt)>30000){if(!lastData)this.streamError="WebSocket подключён, но котировки не поступают";ws.close();return;}if(protocol.ping&&ws.readyState===WebSocket.OPEN)send(protocol.ping);},protocol.pingMs||15000);
    ws.onopen=()=>{if(this.stopped)return;protocol.subscriptions.forEach((subscription,index)=>subscriptionTimers.push(setTimeout(()=>{if(!this.stopped&&this.ws===ws)send(subscription);},(protocol.subscribeDelayMs||0)+index*(protocol.subscriptionIntervalMs||0))));};
    ws.onmessage=event=>{
      if(this.stopped||this.ws!==ws)return;
      lastMessage=Date.now();if(typeof event.data==="string"&&event.data==="pong")return;
      const raw=event.data;queue=queue.then(async()=>{
        if(this.stopped||this.ws!==ws)return;
        let input:unknown;
        if(typeof raw==="string")input=JSON.parse(raw);
        else if(protocol.binary==="gzip"){
          const stream=new Blob([raw as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));input=JSON.parse(await new Response(stream).text());
        }else input=raw;
        const reply=protocol.reply?.(input);if(reply!==undefined&&ws.readyState===WebSocket.OPEN)send(reply);
        for(const quote of protocol.decode(input)){this.quotes.set(quote.asset,quote);lastData=Date.now();this.attempts=0;this.status="live";this.error="";this.streamError="";}
      }).catch(error=>{this.streamError=error instanceof Error?`WebSocket: ${error.message}`:"Некорректные данные WebSocket";ws.close();});
    };
    ws.onerror=()=>{this.streamError="Ошибка подключения WebSocket";ws.close();};
    ws.onclose=event=>{for(const timer of subscriptionTimers)clearTimeout(timer);clearInterval(this.pingTimer);if(this.ws===ws)this.ws=undefined;if(this.stopped)return;this.status="rest";if(event.code!==1000&&!this.streamError)this.streamError=`WebSocket закрыт${event.code?` (${event.code})`:""}${event.reason?`: ${event.reason}`:""}`;this.scheduleReconnect();};
  }
  private scheduleReconnect(){if(this.stopped||this.retryTimer)return;this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;void this.connect();},Math.min(30000,1000*2**Math.min(this.attempts++,5)));}
  stop(){this.stopped=true;clearTimeout(this.pollTimer);clearTimeout(this.retryTimer);clearInterval(this.pingTimer);clearInterval(this.broadcastTimer);if(this.ws){this.ws.onclose=null;this.ws.onmessage=null;this.ws.onerror=null;this.ws.close();}this.listeners.clear();}
}
const shared=globalThis as typeof globalThis&{sinexComparisonFeeds?:Map<ExchangeId,VenueFeed>};
const feeds=shared.sinexComparisonFeeds??=new Map<ExchangeId,VenueFeed>();
/** One upstream collector per selected venue, shared by every browser subscriber. */
export function subscribeComparison(exchange:ExchangeId,listener:Listener){
  let feed=feeds.get(exchange);if(!feed){feed=new VenueFeed(exchange);feeds.set(exchange,feed);}
  const first=feed.listeners.size===0;feed.listeners.add(listener);listener(feed.snapshot());if(first)feed.start();
  return()=>{feed.listeners.delete(listener);if(!feed.listeners.size){feed.stop();if(feeds.get(exchange)===feed)feeds.delete(exchange);}};
}
