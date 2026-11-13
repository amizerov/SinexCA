import {bookUrl,type BookRestAdapter} from "./rest-types";
import {object} from "./model";

export const geminiBook:BookRestAdapter=symbol=>({
  url:bookUrl("https://api.gemini.com",`/v1/book/${encodeURIComponent(symbol)}`,{limit_bids:"20",limit_asks:"20"}),
  decode(input){
    const data=object(input);
    const levels=(value:unknown)=>Array.isArray(value)?value.map(row=>{const item=object(row);return [item.price,item.amount];}):value;
    return {bids:levels(data.bids),asks:levels(data.asks)};
  },
});
