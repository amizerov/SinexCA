import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const mexcBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.mexc.com","/api/v3/depth",{symbol,limit:"20"}),decode:input=>{const data=object(input);return {bids:data.bids,asks:data.asks,time:data.timestamp};}};};
