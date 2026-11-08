import type {TradingPair} from "../types";
import {CRYPTOCOM_WS,cryptoReply,cryptoSubscription} from "../venue-streams";
import {cryptocomResult} from "../exchanges/cryptocom-normalize";
import {object,makeBook} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
import type {BookProtocol} from "./protocols";
export const cryptocomBook:BookRestAdapter=symbol=>({url:bookUrl("https://api.crypto.com","/exchange/v1/public/get-book",{instrument_name:symbol,depth:"20"}),decode(input){const result=cryptocomResult(input),data=object(Array.isArray(result.data)?result.data[0]:null);return {bids:data.bids,asks:data.asks,time:data.t};}});
/** Explicit snapshot mode avoids treating incremental updates as full books. */
export function cryptocomBookProtocol(pair:TradingPair):BookProtocol{
  const subscription=cryptoSubscription([`book.${pair.symbol}.50`]);
  return {url:CRYPTOCOM_WS,subscribeDelayMs:1000,subscriptions:[{...subscription,params:{...subscription.params,book_subscription_type:"SNAPSHOT",book_update_frequency:500}}],reply:cryptoReply,decode(input){
    const result=object(object(input).result);
    if(result.subscription!==`book.${pair.symbol}.50`||result.channel!=="book"||result.instrument_name!==pair.symbol)return;
    const data=object(Array.isArray(result.data)?result.data[0]:null);
    return makeBook(pair.exchange,pair.symbol,data.bids,data.asks,data.t);
  }};
}
