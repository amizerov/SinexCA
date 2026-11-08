import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const bitgetBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.bitget.com","/api/v2/spot/market/orderbook",{symbol,type:"step0",limit:"20"}),decode:input=>{const root=object(input);if(root.code!=="00000")throw new Error("Bitget depth error");const data=object(root.data);return {bids:data.bids,asks:data.asks,time:data.ts};}};};
