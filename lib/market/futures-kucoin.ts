import {record} from "./trades/types";
export async function kucoinFuturesConnection(signal:AbortSignal){
  const response=await fetch("/api/market/kucoin-token?marketType=futures",{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),cache:"no-store"});
  if(!response.ok)throw new Error("KuCoin futures token unavailable");
  const data=record(record(await response.json()).data),url=new URL(String(data.endpoint));
  if(url.protocol!=="wss:"||url.hostname!=="ws-api-futures.kucoin.com"||typeof data.token!=="string")throw new Error("Invalid KuCoin futures endpoint");
  url.search=new URLSearchParams({token:data.token,connectId:crypto.randomUUID()}).toString();
  return {url:url.href,ping:{id:"sinex-futures",type:"ping"},pingMs:Math.min(15000,Number(data.pingInterval)*.7||15000)};
}
