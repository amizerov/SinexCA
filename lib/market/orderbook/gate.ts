import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const gateBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.gateio.ws","/api/v4/spot/order_book",{currency_pair:symbol,limit:"20",interval:"0",with_id:"true"}),decode:input=>{const data=object(input);return {bids:data.bids,asks:data.asks,time:Number(data.current)*1000};}};};
