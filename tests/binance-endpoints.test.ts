import {test} from "node:test";
import assert from "node:assert/strict";
import {BinanceEndpoints} from "../lib/market/binance-endpoints";
import {MarketError} from "../lib/market/errors";

test("network failure switches public Binance requests and remembers the working origin",async()=>{
  const endpoints=new BinanceEndpoints(),calls:string[]=[];
  const load=async(url:URL)=>{calls.push(url.href);if(url.hostname==="data-api.binance.vision")throw new MarketError("NETWORK_ERROR","timeout");return {ok:true};};
  const url=new URL("https://data-api.binance.vision/api/v3/depth?symbol=TRUMPUSDT&limit=5000");
  assert.deepEqual(await endpoints.request(url,load),{ok:true});
  assert.deepEqual(calls,[url.href,"https://api.binance.com/api/v3/depth?symbol=TRUMPUSDT&limit=5000"]);
  calls.length=0;await endpoints.request(url,load);assert.equal(calls.length,1);assert.match(calls[0],/^https:\/\/api.binance.com\//);
});
test("rate limits, regional restrictions and invalid symbols are never retried on another host",async()=>{
  for(const code of ["RATE_LIMIT","ACCESS_RESTRICTED","INVALID_SYMBOL","UPSTREAM_ERROR"]){
    const endpoints=new BinanceEndpoints();let count=0;const error=new MarketError(code,"upstream");
    await assert.rejects(endpoints.request(new URL("https://data-api.binance.vision/api/v3/time"),async()=>{count++;throw error;}),error);
    assert.equal(count,1);
  }
});
test("other exchanges and non-public endpoints remain unchanged",async()=>{
  for(const value of ["https://api.bybit.com/v5/market/time","https://data-api.binance.vision/sapi/v1/account"]){
    const endpoints=new BinanceEndpoints(),calls:string[]=[];
    await assert.rejects(endpoints.request(new URL(value),async(url)=>{calls.push(url.href);throw new MarketError("NETWORK_ERROR","timeout");}));
    assert.deepEqual(calls,[value]);
  }
});
