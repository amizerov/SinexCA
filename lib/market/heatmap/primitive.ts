import type {ISeriesPrimitive,SeriesAttachedParameter,IPrimitivePaneView,IPrimitivePaneRenderer,Logical} from "lightweight-charts";
import type {Candle} from "../types";
import type {HeatSlice,HeatCell} from "./book";
import type {HeatmapSettings} from "./settings";

export interface HeatRect {x:number;y:number;w:number;h:number;cell:HeatCell;time:number;end:number;intensity:number}
export function heatmapTimeCoordinate(time:number,candles:Candle[],convert:(index:number)=>number|null):number|null{
  if(!candles.length)return null;
  const seconds=time/1000;let lo=0,hi=candles.length;
  while(lo<hi){const m=(lo+hi)>>>1;if(candles[m].time<=seconds)lo=m+1;else hi=m;}
  const i=Math.max(0,lo-1),span=(candles[i+1]?.time-candles[i].time)||(candles[i].time-candles[i-1]?.time)||60;
  const logical=i+(seconds-candles[i].time)/span,index=Math.floor(logical);
  // Lightweight Charts 5.2 accepts integer indices only; interpolate pixel coordinates.
  const left=convert(index),right=convert(index+1);
  return left===null||right===null?null:left+(right-left)*(logical-index);
}
export class HeatmapPrimitive implements ISeriesPrimitive {
  slices:HeatSlice[]=[];candles:Candle[]=[];rects:HeatRect[]=[];
  attachedData?:SeriesAttachedParameter;
  constructor(public config:HeatmapSettings){}
  attached(data:SeriesAttachedParameter){this.attachedData=data;}
  detached(){this.attachedData=undefined;this.rects=[];}
  refresh(){this.attachedData?.requestUpdate();}
  private x(time:number){
    const data=this.attachedData,candles=this.candles;if(!data||!candles.length)return null;
    return heatmapTimeCoordinate(time,candles,index=>data.chart.timeScale().logicalToCoordinate(index as Logical));
  }
  private renderer:IPrimitivePaneRenderer={draw:target=>{
    target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
      const data=this.attachedData;if(!data)return;
      ctx.save();
      for(let i=1;i<this.slices.length;i++){
        const previous=this.slices[i-1],next=this.slices[i];if(next.time-previous.end<1500)continue;
        const left=this.x(previous.end),right=this.x(next.time);if(left===null||right===null||right<0||left>mediaSize.width)continue;
        const x=Math.max(0,left),width=Math.min(mediaSize.width,right)-x;
        ctx.fillStyle="rgba(128,140,135,.09)";ctx.fillRect(x,0,width,mediaSize.height);
        if(width>90){ctx.fillStyle="#88958e";ctx.font="11px sans-serif";ctx.fillText("Нет записи",x+6,mediaSize.height-12);}
      }
      ctx.restore();
      const grouped=new Map<string,{rect:HeatRect;count:number;lastTime:number}>();
      // Coalesce subpixel time slices so zooming out does not amplify brightness.
      for(const slice of this.slices){
        const left=this.x(slice.time),right=this.x(slice.end);if(left===null||right===null||right<0||left>mediaSize.width)continue;
        const x=Math.max(0,Math.floor(left)),w=Math.max(1,Math.ceil(right)-x);
        for(const cell of slice.cells){
          if(slice.time-cell.since<this.config.persistence*1000)continue;
          const a=data.series.priceToCoordinate(cell.price),b=data.series.priceToCoordinate(cell.price+slice.step);
          if(a===null||b===null)continue;const y=Math.floor(Math.min(a,b)),h=Math.max(1,Math.ceil(Math.abs(b-a)));
          if(y+h<0||y>mediaSize.height)continue;
          const key=`${x}:${y}:${cell.side}`,old=grouped.get(key);
          if(old){old.rect.cell.notional+=cell.notional;old.rect.cell.quantity+=cell.quantity;if(old.lastTime!==slice.time){old.count++;old.lastTime=slice.time;}old.rect.end=slice.end;old.rect.cell.since=Math.min(old.rect.cell.since,cell.since);}
          else grouped.set(key,{rect:{x,y,w,h,cell:{...cell},time:slice.time,end:slice.end,intensity:0},count:1,lastTime:slice.time});
        }
      }
      const rects=[...grouped.values()].map(({rect,count})=>({...rect,cell:{...rect.cell,notional:rect.cell.notional/count,quantity:rect.cell.quantity/count}}));
      const amounts=rects.map(r=>r.cell.notional).sort((a,b)=>a-b),scale=amounts[Math.floor(amounts.length*.95)]||1;
      ctx.save();ctx.globalAlpha=this.config.opacity/100;
      for(const rect of rects){
        const intensity=Math.min(1,Math.log1p(rect.cell.notional/scale*9)/Math.log(10));rect.intensity=intensity;
        if(intensity<.08)continue;
        const hue=this.config.palette==="green"?155-intensity*65:245-intensity*195;
        ctx.fillStyle=`hsl(${hue} 85% ${15+intensity*48}%)`;ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      }
      ctx.restore();this.rects=rects;
    });
  }};
  private view:IPrimitivePaneView={zOrder:()=>"bottom",renderer:()=>this.renderer};
  paneViews(){return [this.view];}
}
