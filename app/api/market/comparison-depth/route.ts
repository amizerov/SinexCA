import {z} from "zod";
import {EXCHANGE_IDS} from "@/lib/market/exchange-config";
import {getExchange} from "@/lib/market/service";
import {getOrderBook} from "@/lib/market/orderbook/rest";
import {COMPARISON_ASSETS,depthEstimate,pairForAsset} from "@/lib/market/comparison/model";
import {marketRoute,parseQuery} from "@/lib/server/market-route";
import {MarketError} from "@/lib/market/errors";
export const dynamic="force-dynamic";
const schema=z.object({asset:z.enum(COMPARISON_ASSETS),buy:z.enum(EXCHANGE_IDS),sell:z.enum(EXCHANGE_IDS),budget:z.coerce.number().finite().min(1).max(1000000),buyFee:z.coerce.number().min(0).max(5),sellFee:z.coerce.number().min(0).max(5)}).refine(value=>value.buy!==value.sell,{message:"Выберите разные биржи."});
export function GET(request:Request){return marketRoute(request,async()=>{
  const query=parseQuery(schema,request);
  const pairs=await Promise.all([query.buy,query.sell].map(async exchange=>pairForAsset(await getExchange(exchange).getPairs(),query.asset)));
  if(!pairs[0]||!pairs[1])throw new MarketError("INVALID_SYMBOL","Точная Spot-пара в USDT недоступна на одной из бирж.",400);
  const [buy,sell]=await Promise.all(pairs.map(pair=>getOrderBook(pair!.exchange,pair!.symbol)));
  try{return {estimate:depthEstimate(buy,sell,query.budget,query.buyFee,query.sellFee,Date.now()),checkedAt:Math.min(buy.receivedAt,sell.receivedAt),buy,sell};}
  catch(error){throw new MarketError("DEPTH_UNAVAILABLE",error instanceof Error?error.message:"Недостаточно данных стаканов.",422);}
});}
