import {object} from "./model";
import {bookUrl,type BookRestAdapter} from "./rest-types";
export const kucoinBook:BookRestAdapter=symbol=>{return {url:bookUrl("https://api.kucoin.com","/api/v1/market/orderbook/level2_20",{symbol}),decode:input=>{const root=object(input);if(root.code!=="200000")throw new Error("KuCoin depth error");const data=object(root.data);return {bids:data.bids,asks:data.asks,time:data.time};}};};
