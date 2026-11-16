import type {OrderBook} from "../orderbook/model";
import type {HeatCell,HeatSlice} from "./book";

/** Snapshot feeds describe only their published depth. Never invent levels outside it. */
export class SnapshotHeatmap {
  private observed=new Map<string,number>();
  private previousTime=0;
  slice(book:OrderBook,time:number):HeatSlice{
    if(time-this.previousTime>5000)this.observed.clear();
    const current=new Map<string,number>(),cells:HeatCell[]=[];
    let step=Infinity;
    for(const [rows,side] of [[book.bids,"bid"],[book.asks,"ask"]] as const){
      const sorted=[...rows].sort((a,b)=>a.price-b.price);
      for(let i=0;i<sorted.length;i++){
        const row=sorted[i];if(!row.quantity)continue;
        const key=`${side}:${row.price}`,since=this.observed.get(key)??time;
        current.set(key,since);cells.push({...row,notional:row.price*row.quantity,since,side});
        if(i&&row.price>sorted[i-1].price)step=Math.min(step,row.price-sorted[i-1].price);
      }
    }
    this.observed=current;this.previousTime=time;
    return {time,end:time+1000,step:Number.isFinite(step)?step:(cells[0]?.price||1)*.00001,cells};
  }
}

export function largestLiquidity(slice:HeatSlice|undefined,persistence=0):HeatCell[]{
  if(!slice)return [];
  return (["bid","ask"] as const).flatMap(side=>{
    const candidates=slice.cells.filter(cell=>cell.side===side&&slice.time-cell.since>=persistence*1000);
    const largest=candidates.reduce<HeatCell|undefined>((best,cell)=>!best||cell.notional>best.notional?cell:best,undefined);
    return largest?[largest]:[];
  });
}
