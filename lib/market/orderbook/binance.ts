import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const binanceBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://data-api.binance.vision","/api/v3/depth",{symbol,limit:"20"}),decode:input=>{const data=object(input);return {bids:data.bids,asks:data.asks};}};};
