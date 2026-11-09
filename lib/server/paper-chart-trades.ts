import type {DatabaseSync} from "node:sqlite";
import type {DemoFill,DemoOrder} from "@/lib/paper/orders";
import {PaperStore} from "./paper-store";
export interface ChartTradeScope {exchange:string;symbol:string;from:number;to:number}
/** Standalone reader: route updates do not depend on cached class prototypes in dev. */
export function readChartFills(db:DatabaseSync,owner:string,scope:ChartTradeScope){
  const id=new PaperStore(db).read(owner).id;
  const rows=db.prepare("SELECT f.data,o.data AS order_data FROM demo_fills f JOIN demo_orders o ON o.id=f.order_id WHERE o.account_id=? AND json_extract(o.data,'$.exchange')=? AND json_extract(o.data,'$.symbol')=? AND COALESCE(json_extract(f.data,'$.exchangeTime'),json_extract(f.data,'$.receivedAt'))>=? AND COALESCE(json_extract(f.data,'$.exchangeTime'),json_extract(f.data,'$.receivedAt'))<? ORDER BY f.rowid DESC LIMIT 10001").all(id,scope.exchange,scope.symbol,scope.from*1000,scope.to*1000);
  return {truncated:rows.length>10000,fills:rows.slice(0,10000).map(r=>{const order:DemoOrder=JSON.parse(String(r.order_data));return {...JSON.parse(String(r.data)),exchange:order.exchange,symbol:order.symbol,base:order.base,quote:order.quote,side:order.side} as DemoFill;})};
}
