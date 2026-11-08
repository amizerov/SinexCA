import {protobufFields} from "../mexc-protobuf";
import {tick,type TradeFactory} from "./types";
const text=(value:number|Uint8Array|undefined)=>value instanceof Uint8Array?new TextDecoder().decode(value):"";
export const mexcTrades:TradeFactory=pairs=>({url:"wss://wbs-api.mexc.com/ws",subscriptions:[{method:"SUBSCRIPTION",params:pairs.map(p=>`spot@public.aggre.deals.v3.api.pb@100ms@${p.symbol}`)}],ping:{method:"PING"},decode(input){
  if(!(input instanceof ArrayBuffer))return [];const wrapper=protobufFields(new Uint8Array(input)),symbol=text(wrapper.get(3)),payload=wrapper.get(314);
  if(text(wrapper.get(1))!==`spot@public.aggre.deals.v3.api.pb@100ms@${symbol}`||!(payload instanceof Uint8Array))return [];
  const result:ReturnType<typeof tick>=[];protobufFields(payload,(field,value)=>{if(field!==1||!(value instanceof Uint8Array))return;const deal=protobufFields(value);result.push(...tick(symbol,text(deal.get(1)),deal.get(4),text(deal.get(2)),deal.get(3)===1?"buy":deal.get(3)===2?"sell":undefined));});return result;
}});
