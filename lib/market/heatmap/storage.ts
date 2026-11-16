import {HISTORY_MS,type HeatSlice} from "./book";
interface Stored {key:string;updated:number;slices:HeatSlice[]}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open("sinex-liquidity-v1",1);
  request.onupgradeneeded=()=>request.result.createObjectStore("history",{keyPath:"key"});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function loadHeatmap(key:string):Promise<HeatSlice[]>{
  const db=await open();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction("history","readwrite"),store=tx.objectStore("history"),request=store.getAll();let slices:HeatSlice[]=[];
    request.onsuccess=()=>{const rows=request.result as Stored[];const cutoff=Date.now()-HISTORY_MS;
      for(const row of rows){if(row.updated<cutoff)store.delete(row.key);else if(row.key===key)slices=row.slices.filter(s=>s.time>=cutoff);}
      for(const row of rows.sort((a,b)=>b.updated-a.updated).slice(8))store.delete(row.key);
    };tx.oncomplete=()=>resolve(slices);tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function saveHeatmap(key:string,slices:HeatSlice[]){
  const db=await open();try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("history","readwrite"),store=tx.objectStore("history");store.put({key,updated:Date.now(),slices:slices.filter(s=>s.time>=Date.now()-HISTORY_MS).slice(-1800)});
    const rows=store.getAll();rows.onsuccess=()=>{const all=rows.result as Stored[];for(const row of all.sort((a,b)=>b.updated-a.updated).slice(8))store.delete(row.key);};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
