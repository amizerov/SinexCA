import "server-only";
import {cachedAdapter,exchangeRequest} from "./shared";
import {restInterval} from "../intervals";
import {whitebitPairs,whitebitResult,whitebitCandles,whitebitTickers} from "./whitebit-normalize";
const request=exchangeRequest("https://whitebit.com");
export const whitebit=cachedAdapter({
  id:"whitebit",
  getPairs:async()=>whitebitPairs(await request("/api/v4/public/markets"),null),
  getTickers:async symbols=>whitebitTickers(await request("/api/v1/public/tickers"),symbols),
  getCandles:async({symbol,timeframe,limit,endTime})=>whitebitCandles(whitebitResult(await request("/api/v1/public/kline",{market:symbol,interval:restInterval("whitebit",timeframe),limit:String(limit),...endTime!==undefined?{end:String(endTime)}:{}}))).slice(-limit),
});
