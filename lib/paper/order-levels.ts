import {isOpen,type DemoOrder} from "./orders";
export const CURRENT_PRICE_COLOR="#63c8ff";
export const orderColor=(side:"buy"|"sell")=>side==="buy"?"#9bd67a":"#ec7775";
export type OrderLevelKind="limit"|"stop"|"stop_limit";
export interface OrderLevel {order:DemoOrder;kind:OrderLevelKind;price:number}
/** Equal trigger/limit prices belong to one visible level, not overlapping labels. */
export function orderLevels(orders:DemoOrder[]):OrderLevel[]{
  const unique=new Map<string,DemoOrder>();for(const order of orders){const previous=unique.get(order.id);if(!previous||order.updatedAt>=previous.updatedAt)unique.set(order.id,order);}
  return [...unique.values()].filter(isOpen).flatMap<OrderLevel>(order=>{
    const limit=order.limit&&Number.isFinite(order.limit)&&order.limit>0?order.limit:null,stop=!order.triggered&&order.stop&&Number.isFinite(order.stop)&&order.stop>0?order.stop:null;
    if(limit!==null&&limit===stop)return [{order,kind:"stop_limit" as const,price:limit}];
    return [...limit!==null?[{order,kind:"limit" as const,price:limit}]:[],...stop!==null?[{order,kind:"stop" as const,price:stop}]:[]];
  });
}
export const levelName=(kind:OrderLevelKind)=>kind==="stop"?"Стоп":kind==="stop_limit"?"Стоп-лимит":"Лимит";
