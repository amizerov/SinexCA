import type {TradingPair} from "../types";
import {WHITEBIT_WS,WHITEBIT_PING} from "../venue-streams";
import {object,bookLevels,makeBook} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
import type {BookProtocol} from "./protocols";
export const whitebitBook:BookRestAdapter=symbol=>({url:bookUrl("https://whitebit.com",`/api/v4/public/orderbook/${symbol}`,{limit:"20",level:"2"}),decode(input){const data=object(input);return {bids:data.bids,asks:data.asks,time:Number(data.timestamp)*1000};}});
export function whitebitBookProtocol(pair:TradingPair):BookProtocol{
  let ready=false,lastUpdate=0;
  const bids=new Map<number,number>(),asks=new Map<number,number>();
  return {url:WHITEBIT_WS,subscriptions:[{id:1,method:"depth_subscribe",params:[pair.symbol,20,"0",true]}],ping:WHITEBIT_PING,decode(input){
    const event=object(input),params=Array.isArray(event.params)?event.params:[];
    if(event.method!=="depth_update"||params[2]!==pair.symbol)return;
    const snapshot=params[0]===true,data=object(params[1]),update=Number(data.update_id);
    if(!snapshot&&!ready)throw new Error("WhiteBIT snapshot required");
    if(!Number.isSafeInteger(update)||update<1)throw new Error("Invalid WhiteBIT update id");
    if(!snapshot&&update<=lastUpdate)return;
    if(!snapshot&&Number(data.past_update_id)!==lastUpdate)throw new Error("WhiteBIT depth gap");
    if(snapshot){bids.clear();asks.clear();ready=true;}
    for(const [target,changes,descending] of [[bids,data.bids,true],[asks,data.asks,false]] as const){
      for(const row of bookLevels(changes??[])){if(row.quantity===0)target.delete(row.price);else target.set(row.price,row.quantity);}
      const prices=[...target.keys()].sort((a,b)=>descending?b-a:a-b);
      for(const price of prices.slice(20))target.delete(price);
    }
    lastUpdate=update;
    return makeBook(pair.exchange,pair.symbol,[...bids],[...asks],Number(data.event_time??data.timestamp)*1000);
  }};
}
