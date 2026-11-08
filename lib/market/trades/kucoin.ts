import {record,tick,type TradeFactory} from "./types";
export const kucoinTrades:TradeFactory=async(pairs,signal)=>{
  const response=await fetch("/api/market/kucoin-token",{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),cache:"no-store"});if(!response.ok)throw new Error("KuCoin token unavailable");
  const data=record(record(await response.json()).data),url=new URL(String(data.endpoint));if(url.protocol!=="wss:"||url.hostname!=="ws-api-spot.kucoin.com"||typeof data.token!=="string")throw new Error("Invalid KuCoin endpoint");
  url.search=new URLSearchParams({token:data.token,connectId:crypto.randomUUID()}).toString();
  return {url:url.href,subscriptions:[{id:crypto.randomUUID(),type:"subscribe",topic:`/market/match:${pairs.map(p=>p.symbol).join(",")}`,privateChannel:false,response:true}],ping:{id:"sinex-trades",type:"ping"},pingMs:Math.min(15000,Number(data.pingInterval)*.7||15000),decode(input){const event=record(input),item=record(event.data);return event.type==="message"&&event.subject==="trade.l3match"&&event.topic===`/market/match:${item.symbol}`?tick(item.symbol,item.price,Number(item.time)/1e6,item.size,item.side,item.tradeId):[];}};
};
