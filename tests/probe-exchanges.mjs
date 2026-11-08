import { writeFile, mkdir } from "node:fs/promises";
const candidates = [
  ["binance", "https://data-api.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT", "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT", "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5", "wss://data-stream.binance.vision/ws/btcusdt@kline_1h", null, x => x.e === "kline"],
  ["bybit", "https://api.bybit.com/v5/market/instruments-info?category=spot", "https://api.bybit.com/v5/market/tickers?category=spot", "https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=5", "wss://stream.bybit.com/v5/public/spot", { op: "subscribe", args: ["kline.60.BTCUSDT"] }, x => x.topic === "kline.60.BTCUSDT"],
  ["okx", "https://www.okx.com/api/v5/public/instruments?instType=SPOT", "https://www.okx.com/api/v5/market/tickers?instType=SPOT", "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=5", "wss://ws.okx.com:8443/ws/v5/business", { op: "subscribe", args: [{ channel: "candle1H", instId: "BTC-USDT" }] }, x => x.arg?.channel === "candle1H" && x.data],
  ["bitget", "https://api.bitget.com/api/v2/spot/public/symbols", "https://api.bitget.com/api/v2/spot/market/tickers", "https://api.bitget.com/api/v2/spot/market/candles?symbol=BTCUSDT&granularity=1h&limit=5", "wss://ws.bitget.com/v2/ws/public", { op: "subscribe", args: [{ instType: "SPOT", channel: "candle1H", instId: "BTCUSDT" }] }, x => x.arg?.channel === "candle1H" && x.data],
  ["gate", "https://api.gateio.ws/api/v4/spot/currency_pairs", "https://api.gateio.ws/api/v4/spot/tickers", "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1h&limit=5", "wss://api.gateio.ws/ws/v4/", { time: Math.floor(Date.now()/1000), channel: "spot.candlesticks", event: "subscribe", payload: ["1h", "BTC_USDT"] }, x => x.channel === "spot.candlesticks" && x.event === "update"],
  ["kraken", "https://api.kraken.com/0/public/AssetPairs", "https://api.kraken.com/0/public/Ticker?pair=XBTUSDT,ETHUSDT", "https://api.kraken.com/0/public/OHLC?pair=XBTUSDT&interval=60", "wss://ws.kraken.com/v2", { method: "subscribe", params: { channel: "ohlc", symbol: ["BTC/USDT"], interval: 60 } }, x => x.channel === "ohlc" && x.data],
  ["coinbase", "https://api.exchange.coinbase.com/products", "https://api.exchange.coinbase.com/products/stats", "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600", "wss://ws-feed.exchange.coinbase.com", { type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] }, x => x.type === "ticker"],
];
const report=[];
await Promise.allSettled(candidates.map(async ([exchange,pairs,tickers,candles,url,subscription,accept]) => {
  const checks = await Promise.all([pairs,tickers,candles].map(async (url,i) => {
    const start=Date.now();
    try { const r=await fetch(url,{signal:AbortSignal.timeout(12000)});const body=await r.json();return {kind:["pairs","tickers","candles"][i],status:r.status,ms:Date.now()-start,sample:JSON.stringify(body).slice(0,1400)}; }
    catch(e) { return {kind:["pairs","tickers","candles"][i],error:e.message,cause:e.cause?.code}; }
  }));
  const stream=await new Promise(resolve=>{
    const socket=new WebSocket(url);let done=false;
    const end=value=>{if(done)return;done=true;clearTimeout(timer);socket.close();resolve(value);};
    const timer=setTimeout(()=>end({error:"timeout waiting for market data"}),30000);
    socket.onopen=()=>{if(subscription)socket.send(JSON.stringify(subscription));};
    socket.onmessage=e=>{try{const x=JSON.parse(e.data);if(accept(x))end({ok:true,sample:JSON.stringify(x).slice(0,1400)});}catch{}};
    socket.onerror=()=>end({error:"websocket connection error"});
  });
  report.push({exchange,checks,stream});console.log(JSON.stringify(report.at(-1)));
}));
await mkdir(".qa",{recursive:true});await writeFile(".qa/exchange-probe.json",JSON.stringify({checkedAt:new Date().toISOString(),report},null,2));
