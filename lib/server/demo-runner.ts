import "server-only";
import {getAccountStore} from "./accounts";
import {DemoOrders} from "./demo-orders";
import {getOrderBook} from "@/lib/market/orderbook/rest";
import {getExchange} from "@/lib/market/service";
import type {ExchangeId} from "@/lib/market/types";
const state=globalThis as typeof globalThis&{demoTimer?:ReturnType<typeof setTimeout>;demoBusy?:boolean;demoVersion?:number;demoRun?:()=>Promise<void>;demoHealth?:{checkedAt:number;errors:string[]}};
export function demoHealth(){return state.demoHealth??{checkedAt:0,errors:[]};}
export async function demoCycle(){
  if(state.demoBusy)return;state.demoBusy=true;
  const errors:string[]=[];
  try{
    const store=new DemoOrders(getAccountStore().db),markets=new Map(store.active().map(o=>[`${o.exchange}:${o.symbol}`,{exchange:o.exchange,symbol:o.symbol}]));
    // Bounded concurrency and no overlapping polling cycles; never fetch markets without pending orders.
    const queue=[...markets.values()];
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{let market;while((market=queue.shift())){const {exchange,symbol}=market;try{
      const [book,tickers]=await Promise.all([getOrderBook(exchange as ExchangeId,symbol),getExchange(exchange).getTickers([symbol])]);const tick=tickers.find(t=>t.symbol===symbol);store.process(book,tick?{price:tick.lastPrice,receivedAt:tick.receivedAt}:undefined);
    }catch(e){errors.push(`${exchange} · ${symbol}: ${e instanceof Error?e.message:"Нет данных"}`);}}}));
  }finally{state.demoBusy=false;state.demoHealth={checkedAt:Date.now(),errors};}
}
export function startDemoRunner(){
  // Refresh the callback on HMR instead of retaining a previous store implementation.
  state.demoRun=demoCycle;
  if(state.demoVersion!==2){if(state.demoBusy){setTimeout(startDemoRunner,100).unref();return;}if(state.demoTimer)clearTimeout(state.demoTimer);state.demoTimer=undefined;state.demoVersion=2;}
  if(state.demoTimer)return;
  const run=async()=>{try{await state.demoRun?.();}catch(e){state.demoHealth={checkedAt:Date.now(),errors:[e instanceof Error?e.message:"Ошибка DEMO-процессора"]};}state.demoTimer=setTimeout(run,1500);state.demoTimer.unref();};state.demoTimer=setTimeout(run,500);state.demoTimer.unref();
}
