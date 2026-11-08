import { z } from "zod";
import { EXCHANGE_IDS } from "@/lib/market/exchange-config";
import { CoinInfoError,getCoinInfo } from "@/lib/server/coin-info";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const query=z.object({asset:z.string().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform(value=>value.toUpperCase()),id:z.string().min(1).max(180).optional(),provider:z.enum(["coingecko","coinpaprika"]).optional(),exchange:z.enum(EXCHANGE_IDS).optional(),quote:z.string().min(1).max(20).regex(/^[A-Za-z0-9]+$/).optional()}).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)return Response.json({error:{message:"Некорректные параметры монеты."}},{status:400});
  const {asset,...options}=query.data;
  try{return Response.json(await getCoinInfo(asset,options),{headers:{"Cache-Control":"public, max-age=60"}});}
  catch(error){return Response.json({error:{message:error instanceof CoinInfoError?error.message:"Не удалось загрузить информацию о монете."}},{status:error instanceof CoinInfoError?error.status:502,headers:{"Cache-Control":"no-store"}});}
}
