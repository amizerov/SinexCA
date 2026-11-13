import "server-only";
import {cachedAdapter,exchangeRequest} from "./shared";
import {restInterval} from "../intervals";
import {geminiCandles,geminiOverview,geminiPairs,geminiTicker} from "./gemini-normalize";

const request=exchangeRequest("https://api.gemini.com");
export const gemini=cachedAdapter({
  id:"gemini",
  getPairs:async()=>geminiPairs(await request("/v1/symbols"),null),
  getOverview:async()=>geminiOverview(await request("/v1/pricefeed")),
  getTickers:async symbols=>(await Promise.all(symbols.map(symbol=>request(`/v2/ticker/${encodeURIComponent(symbol)}`)))).flatMap(geminiTicker),
  getCandles:async({symbol,timeframe,limit})=>geminiCandles(await request(`/v2/candles/${encodeURIComponent(symbol)}/${restInterval("gemini",timeframe)}`)).slice(-limit),
});
