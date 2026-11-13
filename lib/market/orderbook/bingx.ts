import {bookUrl,type BookRestAdapter} from "./rest-types";
import {object} from "./model";

export const bingxBook:BookRestAdapter=symbol=>({
  url:bookUrl("https://open-api.bingx.com","/openApi/spot/v1/market/depth",{symbol,limit:"20"}),
  decode(input){const envelope=object(input);if(envelope.code!==0)throw new Error(`BingX: ${String(envelope.msg||"ошибка API")}`);const data=object(envelope.data);return {bids:data.bids,asks:data.asks,time:data.ts};},
});
