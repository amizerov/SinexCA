import "server-only";
import type {ExchangeId,TradingPair} from "@/lib/market/types";
import {getExchange} from "@/lib/market/service";
import {COMPARISON_ASSETS,pairForAsset,type ComparisonQuote,type VenueSnapshot} from "@/lib/market/comparison/model";
import {comparisonProtocol} from "@/lib/market/comparison/protocol";

type Listener=(snapshot:VenueSnapshot)=>void;
class VenueFeed {
  listeners=new Set<Listener>();
  private quotes=new Map<string,ComparisonQuote>();
  private pairs:TradingPair[]=[];
  private stopped=false;
  private status:VenueSnapshot["status"]="connecting";
  private error="";
  private pollTimer?:ReturnType<typeof setTimeout>;
  private retryTimer?:ReturnType<typeof setTimeout>;
  private pingTimer?:ReturnType<typeof setInterval>;
  private broadcastTimer?:ReturnType<typeof setInterval>;
  private ws?:WebSocket;
  private attempts=0;
  constructor(readonly exchange:ExchangeId){}
  snapshot():VenueSnapshot{return {exchange:this.exchange,status:this.status,error:this.error,available:this.pairs.map(pair=>pair.baseAsset),quotes:[...this.quotes.values()]};}
  start(){this.broadcastTimer=setInterval(()=>this.emit(),1000);void this.poll();}
  private emit(){if(this.stopped)return;const snapshot=this.snapshot();for(const listener of this.listeners)listener(snapshot);}
  private async poll(){
    try{
      const adapter=getExchange(this.exchange),catalog=await adapter.getPairs();if(this.stopped)return;
      this.pairs=COMPARISON_ASSETS.flatMap(asset=>{const pair=pairForAsset(catalog,asset);return pair?[pair]:[];});
      if(!this.ws&&this.pairs.length&&!this.retryTimer)this.connect();
      const allLive=this.pairs.length&&this.pairs.every(pair=>{const quote=this.quotes.get(pair.baseAsset);return quote?.source==="ws"&&Date.now()-quote.receivedAt<5000;});
      if(!allLive&&this.pairs.length){
        const tickers=await adapter.getTickers(this.pairs.map(pair=>pair.symbol));if(this.stopped)return;
        const indexed=new Map(this.pairs.map(pair=>[pair.symbol,pair]));
        for(const ticker of tickers){
          const pair=indexed.get(ticker.symbol);if(!pair||ticker.exchange!==this.exchange)continue;
          const old=this.quotes.get(pair.baseAsset);if(old&&old.receivedAt>=ticker.receivedAt)continue;
          const positive=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>0?value:null;
          const size=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0?value:null;
          const bid=positive(ticker.bid),ask=positive(ticker.ask);
          this.quotes.set(pair.baseAsset,{exchange:this.exchange,asset:pair.baseAsset,symbol:pair.symbol,bid:bid&&ask&&bid>ask?null:bid,ask:bid&&ask&&bid>ask?null:ask,bidSize:size(ticker.bidSize),askSize:size(ticker.askSize),last:positive(ticker.lastPrice),receivedAt:ticker.receivedAt,source:"rest"});
        }
      }
      this.error="";this.status=[...this.quotes.values()].some(q=>q.source==="ws"&&Date.now()-q.receivedAt<5000)?"live":"rest";
    }catch(error){
      if(!this.stopped){this.error=error instanceof Error?error.message:"Источник недоступен";if(![...this.quotes.values()].some(q=>q.source==="ws"&&Date.now()-q.receivedAt<5000))this.status="error";}
    }finally{if(!this.stopped){this.emit();this.pollTimer=setTimeout(()=>void this.poll(),5000);}}
  }
  private connect(){
    const protocol=comparisonProtocol(this.exchange,this.pairs);if(this.stopped||!protocol)return;
    const ws=new WebSocket(protocol.url);this.ws=ws;let lastMessage=Date.now();
    this.pingTimer=setInterval(()=>{if(Date.now()-lastMessage>30000){ws.close();return;}if(protocol.ping&&ws.readyState===WebSocket.OPEN)ws.send(protocol.ping);},15000);
    ws.onopen=()=>{if(this.stopped)return;for(const subscription of protocol.subscriptions)ws.send(JSON.stringify(subscription));};
    ws.onmessage=event=>{
      if(this.stopped||this.ws!==ws)return;
      lastMessage=Date.now();if(String(event.data)==="pong")return;
      try{for(const quote of protocol.decode(JSON.parse(String(event.data)))){this.quotes.set(quote.asset,quote);this.attempts=0;this.status="live";this.error="";}}catch{ws.close();}
    };
    ws.onerror=()=>ws.close();
    ws.onclose=()=>{clearInterval(this.pingTimer);if(this.ws===ws)this.ws=undefined;if(this.stopped)return;this.status="rest";this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;this.connect();},Math.min(30000,1000*2**Math.min(this.attempts++,5)));};
  }
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
