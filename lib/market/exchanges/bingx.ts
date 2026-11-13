import "server-only";
import {cachedAdapter,exchangeRequest} from "./shared";
import {restInterval} from "../intervals";
import {bingxCandles,bingxPairs,bingxTickers} from "./bingx-normalize";

const request=exchangeRequest("https://open-api.bingx.com");
export const bingx=cachedAdapter({
  id:"bingx",
  getPairs:async()=>bingxPairs(await request("/openApi/spot/v1/common/symbols"),null),
  getOverview:async()=>bingxTickers(await request("/openApi/spot/v1/ticker/24hr")),
  getTickers:async symbols=>(await Promise.all(symbols.map(async symbol=>bingxTickers(await request("/openApi/spot/v1/ticker/24hr",{symbol}),[symbol])))).flat(),
  getCandles:async({symbol,timeframe,limit})=>bingxCandles(await request("/openApi/spot/v2/market/kline",{symbol,interval:restInterval("bingx",timeframe),limit:String(Math.min(1000,limit))})).slice(-limit),
});
