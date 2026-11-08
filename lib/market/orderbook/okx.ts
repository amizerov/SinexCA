import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const okxBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://www.okx.com","/api/v5/market/books",{instId:symbol,sz:"20"}),decode:input=>{const root=object(input);if(root.code!=="0")throw new Error("OKX depth error");const data=object(Array.isArray(root.data)?root.data[0]:null);return {bids:data.bids,asks:data.asks,time:data.ts};}};};
