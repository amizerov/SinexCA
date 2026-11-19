import {z} from "zod";
import {EXCHANGE_IDS} from "@/lib/market/exchange-config";
import {subscribeComparison} from "@/lib/server/comparison-feed";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const schema=z.string().max(200).transform(value=>[...new Set(value.split(","))]).pipe(z.array(z.enum(EXCHANGE_IDS)).min(1).max(14));
export function GET(request:Request){
  const parsed=schema.safeParse(new URL(request.url).searchParams.get("exchanges")||"binance,bybit,okx");
  if(!parsed.success)return Response.json({error:{message:"Выберите от 1 до 14 доступных бирж."}},{status:400});
  const encoder=new TextEncoder();let cleanup=()=>{};
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let closed=false;const stops:Array<()=>void>=[];
    cleanup=()=>{if(closed)return;closed=true;for(const stop of stops)stop();request.signal.removeEventListener("abort",cleanup);try{controller.close();}catch{/* Already cancelled. */}};
    request.signal.addEventListener("abort",cleanup,{once:true});if(request.signal.aborted){cleanup();return;}
    for(const exchange of parsed.data){
      const stop=subscribeComparison(exchange,snapshot=>{if(!closed){try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));}catch{cleanup();}}});
      if(closed)stop();else stops.push(stop);
    }
  },cancel(){cleanup();}});
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
