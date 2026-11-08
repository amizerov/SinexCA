import {test} from "node:test";
import assert from "node:assert/strict";
import {fitWindow,readWindowLayout} from "../lib/ui/floating-window";
test("floating book restores valid layout and always keeps its header and resize edges in the viewport",()=>{
  const viewport={width:320,height:568};
  for(const value of [null,"invalid",JSON.stringify({x:20,y:10,width:"300",height:400}),JSON.stringify({x:900,y:1000,width:900,height:1200})]){
    const layout=readWindowLayout(value,viewport);assert.ok(layout.x>=8);assert.ok(layout.y>=8);assert.ok(layout.x+layout.width<=312);assert.ok(layout.y+layout.height<=560);
  }
  const saved={x:120,y:100,width:320,height:480};assert.deepEqual(readWindowLayout(JSON.stringify(saved),{width:1440,height:900}),saved);
  const minimum=fitWindow({x:-100,y:-200,width:50,height:20},viewport);assert.equal(minimum.width,260);assert.equal(minimum.height,180);assert.equal(minimum.x,8);assert.equal(minimum.y,8);
});
