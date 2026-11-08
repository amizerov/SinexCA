import { restInterval,shiftInterval } from "../intervals";
import "server-only";
import { cachedAdapter, exchangeRequest } from "./shared";
import { extraPairs, extraTickers, extraCandles } from "./extra-normalize";
import { mergeCandles } from "../normalize";
import type { Candle } from "../types";
const request = exchangeRequest("https://api.mexc.com");
export const mexc = cachedAdapter({
  id: "mexc",
  getPairs: async () => extraPairs("mexc", await request("/api/v3/exchangeInfo"),null),
  getTickers: async symbols => extraTickers("mexc", await request("/api/v3/ticker/24hr"), symbols),
  getCandles: async ({ symbol, timeframe, limit }) => {
    let candles:Candle[]=[],endTime:string|undefined;
    // MEXC documents a maximum of 500 candles per response; paginate by UTC end time.
    for(let page=0;page<Math.ceil(limit/500)+1&&candles.length<limit;page++){
      const size=Math.min(500,limit-candles.length);
      const batch=extraCandles("mexc",await request("/api/v3/klines",{symbol,interval:restInterval("mexc",timeframe),limit:String(size),...endTime?{endTime,startTime:String(shiftInterval((Number(endTime)+1)/1000,timeframe,-size)*1000)}:{}}));
      if(!batch.length)break;const next=String(batch[0].time*1000-1);if(next===endTime)break;
      candles=mergeCandles(candles,batch,limit);endTime=next;
    }
    return candles;
  },
});
