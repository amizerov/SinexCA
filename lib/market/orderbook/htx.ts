import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const htxBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.huobi.pro","/market/depth",{symbol,type:"step0",depth:"20"}),decode:input=>{const root=object(input);if(root.status!=="ok")throw new Error("HTX depth error");const data=object(root.tick);return {bids:data.bids,asks:data.asks,time:root.ts};}};};
