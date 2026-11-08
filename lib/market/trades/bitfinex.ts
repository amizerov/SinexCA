import {record,rows,tick,type TradeFactory} from "./types";
export const bitfinexTrades:TradeFactory=pairs=>{
  const channels=new Map<number,string>();return {url:"wss://api-pub.bitfinex.com/ws/2",subscriptions:pairs.map(p=>({event:"subscribe",channel:"trades",symbol:p.symbol})),decode(input){
    const event=record(input);if(event.event==="subscribed"&&event.channel==="trades"&&typeof event.chanId==="number"&&typeof event.symbol==="string")channels.set(event.chanId,event.symbol);
    const values=rows(input),symbol=channels.get(Number(values[0]));if(!symbol||values[1]!=="tu")return [];const trade=rows(values[2]),amount=Number(trade[2]);return tick(symbol,trade[3],trade[1],Math.abs(amount),amount>0?"buy":amount<0?"sell":undefined,trade[0]);
  }};
};
