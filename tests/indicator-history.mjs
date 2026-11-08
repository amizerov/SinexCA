import assert from "node:assert/strict";
const baseURL=process.env.BASE_URL||"http://localhost:3002";
const symbols={binance:"BTCUSDT",bybit:"BTCUSDT",okx:"BTC-USDT",bitget:"BTCUSDT",gate:"BTC_USDT",kraken:"XBTUSDT",coinbase:"BTC-USD",kucoin:"BTC-USDT",bitfinex:"tBTCUST",htx:"btcusdt",mexc:"BTCUSDT"};
const results=await Promise.allSettled(Object.entries(symbols).map(async([exchange,symbol])=>{
  const query=new URLSearchParams({exchange,symbol,timeframe:"1h",limit:"1000"}),response=await fetch(`${baseURL}/api/market/candles?${query}`,{signal:AbortSignal.timeout(45000)}),json=await response.json();
  assert.equal(response.status,200,`${exchange}: ${JSON.stringify(json.error)}`);assert.ok(json.data.length>500&&json.data.length<=1000,`${exchange} must provide additional warmup candles`);
  console.log("PASS warmup history",exchange,json.data.length,"candles");
}));
results.forEach(result=>{if(result.status==="rejected")console.error(result.reason);});assert.ok(results.every(result=>result.status==="fulfilled"));
