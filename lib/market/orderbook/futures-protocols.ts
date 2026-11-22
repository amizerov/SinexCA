import type {TradingPair} from "../types";
import type {BookProtocol} from "./protocols";
import {object,bookLevels,makeBook} from "./model";
import {whitebitBookProtocol} from "./whitebit";
import {cryptocomBookProtocol} from "./cryptocom";
import {kucoinFuturesConnection} from "../futures-kucoin";

export async function extraFuturesBookProtocol(pair:TradingPair,signal:AbortSignal):Promise<BookProtocol>{
  const {exchange,symbol}=pair,size=pair.contractSize??1;
  const book=(bids:unknown,asks:unknown,time?:unknown)=>{
    const scale=(rows:unknown)=>bookLevels(rows).map(row=>[row.price,row.quantity*size]);
    return makeBook(exchange,symbol,scale(bids),scale(asks),time);
  };
  switch(exchange){
    case "whitebit":return whitebitBookProtocol(pair);
    case "cryptocom":return cryptocomBookProtocol(pair);
    case "bitget":return {url:"wss://ws.bitget.com/v2/ws/public",subscriptions:[{op:"subscribe",args:[{instType:"USDT-FUTURES",channel:"books5",instId:symbol}]}],ping:"ping",decode(input){const x=object(input),arg=object(x.arg);if(arg.channel!=="books5"||arg.instId!==symbol)return;const r=object(Array.isArray(x.data)?x.data[0]:undefined);return book(r.bids,r.asks,r.ts);}};
    case "gate":return {url:"wss://fx-ws.gateio.ws/v4/ws/usdt",subscriptions:[{time:Math.floor(Date.now()/1000),channel:"futures.order_book",event:"subscribe",payload:[symbol,"20","0"]}],ping:{channel:"futures.ping"},decode(input){const x=object(input),r=object(x.result);if(x.channel!=="futures.order_book"||x.event!=="all"||r.contract!==symbol)return;const side=(rows:unknown)=>Array.isArray(rows)?rows.map(row=>{const x=object(row);return [x.p,x.s];}):rows;return book(side(r.bids),side(r.asks),r.t);}};
    case "htx":return {url:"wss://api.hbdm.com/linear-swap-ws",subscriptions:[{sub:`market.${symbol}.depth.step0`,id:symbol}],reply(input){const x=object(input);return typeof x.ping==="number"?{pong:x.ping}:undefined;},decode(input){const x=object(input),r=object(x.tick);if(x.ch!==`market.${symbol}.depth.step0`)return;return book(r.bids,r.asks,r.ts??x.ts);}};
    case "kucoin":return {...await kucoinFuturesConnection(signal),subscriptions:[{id:crypto.randomUUID(),type:"subscribe",topic:`/contractMarket/level2Depth50:${symbol}`,privateChannel:false,response:true}],decode(input){const x=object(input),r=object(x.data);if(x.type!=="message"||x.topic!==`/contractMarket/level2Depth50:${symbol}`)return;return book(r.bids,r.asks,r.timestamp);}};
    case "mexc":return {url:"wss://contract.mexc.com/edge",subscriptions:[{method:"sub.depth.full",param:{symbol,limit:20}}],ping:{method:"ping"},decode(input){const x=object(input),r=object(x.data);if(x.channel!=="push.depth.full"||x.symbol!==symbol)return;return book(r.bids,r.asks,r.timestamp??x.ts);}};
    case "bingx":return {url:"wss://open-api-swap.bingx.com/swap-market",subscriptions:[{id:crypto.randomUUID(),reqType:"sub",dataType:`${symbol}@depth20`}],reply(input){const x=object(input);return x.ping?{pong:x.ping}:undefined;},decode(input){const x=object(input),r=object(x.data);if(x.dataType!==`${symbol}@depth20`)return;return book(r.bids??r.b,r.asks??r.a,r.T??r.E);}};
    case "kraken":case "coinbase":case "bitfinex":{
      const bids=new Map<number,number>(),asks=new Map<number,number>();let ready=false,channel:number|undefined,lastSequence:number|undefined;
      const update=(side:Map<number,number>,price:number,quantity:number)=>{if(!Number.isFinite(price)||price<=0||!Number.isFinite(quantity)||quantity<0)throw new Error("Invalid futures depth");if(quantity===0)side.delete(price);else side.set(price,quantity);};
      const snapshot=()=>book([...bids],[...asks]);
      if(exchange==="kraken")return {url:"wss://futures.kraken.com/ws/v1",subscriptions:[{event:"subscribe",feed:"book",product_ids:[symbol]}],ping:{event:"ping"},decode(input){const x=object(input);if(x.product_id!==symbol||x.feed!=="book_snapshot"&&x.feed!=="book")return;const sequence=Number(x.seq);if(x.feed==="book_snapshot"){bids.clear();asks.clear();ready=true;for(const [side,rows] of [[bids,x.bids],[asks,x.asks]] as const)if(Array.isArray(rows))for(const row of rows){const r=object(row);update(side,Number(r.price),Number(r.qty));}}else{if(!ready)return;if(lastSequence!==undefined&&sequence!==lastSequence+1)throw new Error("Kraken futures depth gap");if(x.side!=="buy"&&x.side!=="sell")return;update(x.side==="buy"?bids:asks,Number(x.price),Number(x.qty));}lastSequence=sequence;if(bids.size+asks.size>20000)throw new Error("Futures depth too large");return snapshot();}};
      if(exchange==="coinbase")return {url:"wss://advanced-trade-ws.coinbase.com",subscriptions:[{type:"subscribe",channel:"level2",product_ids:[symbol]},{type:"subscribe",channel:"heartbeats"}],decode(input){const x=object(input),sequence=Number(x.sequence_num);if(Number.isSafeInteger(sequence)){if(lastSequence!==undefined&&sequence!==lastSequence+1)throw new Error("Coinbase futures depth gap");lastSequence=sequence;}if(x.channel!=="l2_data")return;let changed=false;if(Array.isArray(x.events))for(const event of x.events){const r=object(event);if(r.product_id!==symbol)continue;if(r.type==="snapshot"){bids.clear();asks.clear();ready=true;}if(!ready)continue;if(Array.isArray(r.updates))for(const value of r.updates){const u=object(value);if(u.side!=="bid"&&u.side!=="offer")continue;update(u.side==="bid"?bids:asks,Number(u.price_level),Number(u.new_quantity));changed=true;}}if(bids.size+asks.size>20000)throw new Error("Futures depth too large");return changed?snapshot():undefined;}};
      return {url:"wss://api-pub.bitfinex.com/ws/2",subscriptions:[{event:"subscribe",channel:"book",symbol,prec:"P0",freq:"F0",len:"25"}],decode(input){const x=object(input);if(x.event==="subscribed"&&x.channel==="book"&&x.symbol===symbol){channel=Number(x.chanId);return;}if(!Array.isArray(input)||input[0]!==channel||!Array.isArray(input[1]))return;const rows=Array.isArray(input[1][0])?input[1]:[input[1]];if(Array.isArray(input[1][0])){bids.clear();asks.clear();ready=true;}if(!ready)return;for(const row of rows){if(!Array.isArray(row)||row.length<3)throw new Error("Invalid Bitfinex depth");const amount=Number(row[2]);update(amount>0?bids:asks,Number(row[0]),Number(row[1])===0?0:Math.abs(amount));}return snapshot();}};
    }
    default:throw new Error("Use native futures depth");
  }
}
