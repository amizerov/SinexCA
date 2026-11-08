export interface WindowLayout {x:number;y:number;width:number;height:number}
export function fitWindow(layout:WindowLayout,viewport:{width:number;height:number}):WindowLayout{
  const maxWidth=Math.max(1,viewport.width-16),maxHeight=Math.max(1,viewport.height-16);
  const width=Math.max(Math.min(260,maxWidth),Math.min(layout.width,maxWidth)),height=Math.max(Math.min(180,maxHeight),Math.min(layout.height,maxHeight));
  return {width,height,x:Math.max(8,Math.min(layout.x,viewport.width-width-8)),y:Math.max(8,Math.min(layout.y,viewport.height-height-8))};
}
export function readWindowLayout(value:string|null,viewport:{width:number;height:number}):WindowLayout{
  const fallback={x:viewport.width-316,y:88,width:300,height:480};
  try{const parsed=JSON.parse(value||"null");if(parsed&&["x","y","width","height"].every(key=>typeof parsed[key]==="number"&&Number.isFinite(parsed[key])))return fitWindow(parsed,viewport);}catch{/* Invalid local preferences fall back to a visible window. */}
  return fitWindow(fallback,viewport);
}
