import {record,rows,tick,type TradeFactory,type TradeProtocol} from "./types";
import {whitebitTrades} from "./whitebit";
import {cryptocomTrades} from "./cryptocom";
import {bitfinexTrades} from "./bitfinex";
import {kucoinFuturesConnection} from "../futures-kucoin";

export const futuresTrades:TradeFactory=async(pairs,signal):Promise<TradeProtocol>=>{
  const pair=pairs[0];if(!pair)throw new Error("Futures pair required");
  const {exchange,symbol}=pair,size=pair.contractSize??1;
  switch(exchange){
    case "whitebit":return whitebitTrades(pairs,signal);
    case "cryptocom":return cryptocomTrades(pairs,signal);
    case "bitfinex":return bitfinexTrades(pairs,signal);
    case "bitget":return {url:"wss://ws.bitget.com/v2/ws/public",subscriptions:[{op:"subscribe",args:[{instType:"USDT-FUTURES",channel:"trade",instId:symbol}]}],ping:"ping",decode(input){const x=record(input),arg=record(x.arg);return arg.instId===symbol&&arg.channel==="trade"?rows(x.data).flatMap(value=>{const r=record(value);return tick(symbol,r.price,r.ts,r.size,r.side,r.tradeId);}):[];}};
    case "gate":return {url:"wss://fx-ws.gateio.ws/v4/ws/usdt",subscriptions:[{time:Math.floor(Date.now()/1000),channel:"futures.trades",event:"subscribe",payload:[symbol]}],ping:{channel:"futures.ping"},decode(input){const x=record(input);return x.channel==="futures.trades"&&x.event==="update"?rows(x.result).flatMap(value=>{const r=record(value),amount=Number(r.size);return r.contract===symbol?tick(symbol,r.price,r.create_time_ms??Number(r.create_time)*1000,Math.abs(amount)*size,amount>0?"buy":"sell",r.id):[];}):[];}};
    case "kraken":return {url:"wss://futures.kraken.com/ws/v1",subscriptions:[{event:"subscribe",feed:"trade",product_ids:[symbol]}],ping:{event:"ping"},decode(input){const x=record(input);return x.feed==="trade"&&x.product_id===symbol?tick(symbol,x.price,x.time,Number(x.qty)*size,x.side,x.uid):[];}};
    case "coinbase":return {url:"wss://advanced-trade-ws.coinbase.com",subscriptions:[{type:"subscribe",channel:"market_trades",product_ids:[symbol]},{type:"subscribe",channel:"heartbeats"}],decode(input){const x=record(input);return x.channel==="market_trades"?rows(x.events).flatMap(value=>rows(record(value).trades).flatMap(value=>{const r=record(value);return r.product_id===symbol?tick(symbol,r.price,Date.parse(String(r.time)),Number(r.size)*size,r.side==="BUY"?"sell":r.side==="SELL"?"buy":undefined,r.trade_id):[];})):[];}};
    case "kucoin":return {...await kucoinFuturesConnection(signal),subscriptions:[{id:crypto.randomUUID(),type:"subscribe",topic:`/contractMarket/execution:${symbol}`,privateChannel:false,response:true}],decode(input){const x=record(input),r=record(x.data);return x.type==="message"&&x.topic===`/contractMarket/execution:${symbol}`&&r.symbol===symbol?tick(symbol,r.price,Number(r.ts??r.time)/1e6,Number(r.size)*size,r.side,r.tradeId):[];}};
    case "htx":return {url:"wss://api.hbdm.com/linear-swap-ws",subscriptions:[{sub:`market.${symbol}.trade.detail`,id:symbol}],reply(input){const x=record(input);return typeof x.ping==="number"?{pong:x.ping}:undefined;},decode(input){const x=record(input);return x.ch===`market.${symbol}.trade.detail`?rows(record(x.tick).data).flatMap(value=>{const r=record(value);return tick(symbol,r.price,r.ts,Number(r.amount)*size,r.direction,r.tradeId??r.id);}):[];}};
    case "mexc":return {url:"wss://contract.mexc.com/edge",subscriptions:[{method:"sub.deal",param:{symbol,reduce:false}}],ping:{method:"ping"},decode(input){const x=record(input);return x.channel==="push.deal"&&x.symbol===symbol?(Array.isArray(x.data)?x.data:[x.data]).flatMap(value=>{const r=record(value);return tick(symbol,r.p,r.t,Number(r.v)*size,r.T===1?"buy":r.T===2?"sell":undefined,r.i??r.id);}):[];}};
    case "bingx":return {url:"wss://open-api-swap.bingx.com/swap-market",subscriptions:[{id:crypto.randomUUID(),reqType:"sub",dataType:`${symbol}@trade`}],reply(input){const x=record(input);return x.ping?{pong:x.ping}:undefined;},decode(input){const x=record(input);return x.dataType===`${symbol}@trade`?(Array.isArray(x.data)?x.data:[x.data]).flatMap(value=>{const r=record(value);return tick(symbol,r.p??r.price,r.T??r.t??r.time,r.q??r.v??r.quantity,typeof r.m==="boolean"?r.m?"sell":"buy":undefined,r.a??r.id);}):[];}};
    default:throw new Error("Use the native futures protocol");
  }
};
