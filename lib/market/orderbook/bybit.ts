import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const bybitBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.bybit.com","/v5/market/orderbook",{category:"spot",symbol,limit:"50"}),decode:input=>{const root=object(input);if(root.retCode!==0)throw new Error("Bybit depth error");const data=object(root.result);if(data.s!==symbol)throw new Error("Wrong Bybit depth");return {bids:data.b,asks:data.a,time:data.ts};}};};
