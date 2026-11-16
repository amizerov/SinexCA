import {bookLevels,object} from "../orderbook/model";

export interface HeatCell {price:number;quantity:number;notional:number;since:number;side:"bid"|"ask"}
export interface HeatSlice {time:number;end:number;step:number;cells:HeatCell[]}
interface Level {quantity:number;since:number}
export const HISTORY_MS=30*60*1000;
/** A fixed snapshot coverage prevents newly discovered outer levels looking like complete depth. */
export class HeatBook {
  bids=new Map<number,Level>();asks=new Map<number,Level>();sequence=0;
  low=0;high=Infinity;step=0;
  snapshot(input:unknown,now:number){
    const data=object(input),bids=bookLevels(data.bids),asks=bookLevels(data.asks);
    if(!Number.isSafeInteger(data.lastUpdateId)||!bids.length||!asks.length)throw new Error("Invalid depth snapshot");
    this.sequence=Number(data.lastUpdateId);this.bids.clear();this.asks.clear();
    this.low=Math.min(...bids.map(x=>x.price));this.high=Math.max(...asks.map(x=>x.price));
    const mid=(bids[0].price+asks[0].price)/2;
    // Fixed for this synchronized session; storage does not depend on the viewport.
    this.step=10**Math.floor(Math.log10(mid*.0001));
    for(const [rows,map] of [[bids,this.bids],[asks,this.asks]] as const)for(const row of rows)if(row.quantity)map.set(row.price,{quantity:row.quantity,since:now});
    this.validate();
  }
  update(input:unknown,now:number){
    const data=object(input),first=Number(data.U),last=Number(data.u);
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first>last)throw new Error("Invalid depth sequence");
    if(last<=this.sequence)return false;
    if(first>this.sequence+1)throw new Error("Depth sequence gap");
    const bids=bookLevels(data.b),asks=bookLevels(data.a);
    for(const [rows,map] of [[bids,this.bids],[asks,this.asks]] as const)for(const row of rows){
      if(row.price<this.low||row.price>this.high)continue;
      if(!row.quantity)map.delete(row.price);else map.set(row.price,{quantity:row.quantity,since:map.get(row.price)?.since??now});
    }
    this.sequence=last;this.validate();return true;
  }
  private validate(){
    const bid=Math.max(...this.bids.keys()),ask=Math.min(...this.asks.keys());
    if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid>=ask||bid<=this.low||ask>=this.high)throw new Error("Depth coverage lost");
  }
  slice(time:number):HeatSlice{
    const cells:HeatCell[]=[];
    for(const [map,side] of [[this.bids,"bid"],[this.asks,"ask"]] as const){
      const groups=new Map<number,HeatCell>();
      for(const [price,level] of map){
        const index=Math.floor(price/this.step+1e-7),old=groups.get(index);
        if(old){old.quantity+=level.quantity;old.notional+=price*level.quantity;old.since=Math.min(old.since,level.since);}
        else groups.set(index,{price:index*this.step,quantity:level.quantity,notional:price*level.quantity,since:level.since,side});
      }
      // Bound storage and rendering. Show only recorded nearby buckets, never infer outer depth.
      cells.push(...[...groups.values()].sort((a,b)=>side==="bid"?b.price-a.price:a.price-b.price).slice(0,80));
    }
    return {time,end:time+1000,step:this.step,cells};
  }
}
