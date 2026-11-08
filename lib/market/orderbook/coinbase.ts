import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const coinbaseBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.exchange.coinbase.com",`/products/${encodeURIComponent(symbol)}/book`,{level:"2"}),decode:input=>{const data=object(input);return {bids:Array.isArray(data.bids)?data.bids.slice(0,20):data.bids,asks:Array.isArray(data.asks)?data.asks.slice(0,20):data.asks};}};};
