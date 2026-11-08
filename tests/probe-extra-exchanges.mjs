import { mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const candidates = [
  ["kucoin", "https://api.kucoin.com/api/v2/symbols", "https://api.kucoin.com/api/v1/market/allTickers", "https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1hour"],
  ["bitfinex", "https://api-pub.bitfinex.com/v2/conf/pub:list:pair:exchange", "https://api-pub.bitfinex.com/v2/tickers?symbols=tBTCUST,tETHUST", "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUST/hist?limit=5"],
  ["htx", "https://api.huobi.pro/v1/common/symbols", "https://api.huobi.pro/market/tickers", "https://api.huobi.pro/market/history/kline?symbol=btcusdt&period=60min&size=5"],
  ["mexc", "https://api.mexc.com/api/v3/exchangeInfo", "https://api.mexc.com/api/v3/ticker/24hr?symbol=BTCUSDT", "https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=60m&limit=5"],
];
const result = await Promise.all(candidates.map(async ([exchange,...urls]) => {
  const checks=await Promise.all(urls.map(async(url,i)=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)}); const json=await r.json();return {kind:["pairs","tickers","candles"][i],status:r.status,sample:JSON.stringify(json).slice(0,1700)}}catch(e){return {kind:["pairs","tickers","candles"][i],error:e.message,cause:e.cause?.code}}}));
  console.log(JSON.stringify({exchange,checks}));return {exchange,checks};
}));
const sockets=[
  ["bitfinex","wss://api-pub.bitfinex.com/ws/2",{event:"subscribe",channel:"candles",key:"trade:1h:tBTCUST"},x=>Array.isArray(x)&&Array.isArray(x[1])],
  ["htx","wss://api.huobi.pro/ws",{sub:"market.btcusdt.kline.60min",id:"sinex-probe"},x=>!!x.tick],
];
try{
  const r=await fetch("https://api.kucoin.com/api/v1/bullet-public",{method:"POST",signal:AbortSignal.timeout(12000)});const json=await r.json();
  console.log("kucoin public token",r.status,json.code,JSON.stringify(json.data?.instanceServers));
  if(json.data?.token)sockets.push(["kucoin",`${json.data.instanceServers[0].endpoint}?token=${encodeURIComponent(json.data.token)}&connectId=sinex-probe`,{id:"sinex-probe",type:"subscribe",topic:"/market/candles:BTC-USDT_1hour",privateChannel:false,response:true},x=>x.type==="message"&&!!x.data?.candles]);
}catch(e){console.log("kucoin token",e.message)}
await Promise.all(sockets.map(([exchange,url,message,accept])=>new Promise(resolve=>{
  let done=false,channels={};const ws=new WebSocket(url);ws.binaryType="arraybuffer";
  const end=value=>{if(done)return;done=true;clearTimeout(timer);ws.close();const item={exchange,stream:value};result.push(item);console.log(JSON.stringify(item));resolve()};
  const timer=setTimeout(()=>end({error:"timeout waiting for candle"}),30000);
  ws.onopen=()=>ws.send(JSON.stringify(message));
  ws.onmessage=e=>{try{let raw=e.data;if(typeof raw!=="string")raw=gunzipSync(Buffer.from(raw)).toString();const x=JSON.parse(raw);if(x.ping)ws.send(JSON.stringify({pong:x.ping}));if(x.event==="subscribed")channels[x.chanId]=x.key;if(accept(x))end({ok:true,sample:JSON.stringify(x).slice(0,1200)})}catch{}};
  ws.onerror=()=>end({error:"websocket error"});
})));
await mkdir(".qa",{recursive:true});await writeFile(".qa/extra-exchange-probe.json",JSON.stringify({checkedAt:new Date().toISOString(),result},null,2));
