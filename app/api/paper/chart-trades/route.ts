import {NextResponse} from "next/server";
import {z} from "zod";
import {EXCHANGE_IDS} from "@/lib/market/exchange-config";
import {authFailure,authHeaders,getAccountStore,requestAccount,sessionCookie} from "@/lib/server/accounts";
import {AccountError} from "@/lib/server/account-store";
import {DemoOrders} from "@/lib/server/demo-orders";
import {readChartFills} from "@/lib/server/paper-chart-trades";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const query=z.object({exchange:z.enum(EXCHANGE_IDS),symbol:z.string().min(1).max(100),from:z.coerce.number().finite().min(0).max(1e11),to:z.coerce.number().finite().min(0).max(1e11)}).refine(v=>v.to>v.from);
export async function GET(request:Request){try{
  const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)throw new AccountError("Некорректный диапазон истории сделок",400);
  const account=await requestAccount(),db=getAccountStore().db;
  new DemoOrders(db);
  const data=readChartFills(db,account.session.ownerId,parsed.data);
  const response=NextResponse.json({ownerId:account.session.ownerId,...data},{headers:authHeaders});return account.fresh?sessionCookie(response,account.token,request):response;
}catch(e){if(!(e instanceof AccountError))console.error("[paper/chart-trades]",e instanceof Error?`${e.name}: ${e.message}`:"Unknown error");return authFailure(e instanceof AccountError?e:new AccountError("Не удалось загрузить историю сделок",500));}}
