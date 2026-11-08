import {z} from "zod";
import {findCoinListings} from "@/lib/market/coin-listings";
import {getExchange} from "@/lib/market/service";
import {marketCache} from "@/lib/server/cache";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const query=z.object({asset:z.string().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform(value=>value.toUpperCase())}).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)return Response.json({error:{message:"Некорректный тикер монеты."}},{status:400});
  try{
    const data=await marketCache.get(`coin-listings:${query.data.asset}`,60000,()=>findCoinListings(query.data.asset,exchange=>getExchange(exchange).getPairs()));
    return Response.json({data},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:{message:"Не удалось проверить биржи. Повторите позже."}},{status:502});}
}
