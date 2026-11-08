import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const krakenBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.kraken.com","/0/public/Depth",{pair:symbol,count:"20"}),decode:input=>{const root=object(input);if(!Array.isArray(root.error)||root.error.length)throw new Error("Kraken depth error");const result=object(root.result),values=Object.values(result);if(values.length!==1)throw new Error("Wrong Kraken depth");const data=object(values[0]);return {bids:data.bids,asks:data.asks};}};};
