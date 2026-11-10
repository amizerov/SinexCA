import {NextResponse} from "next/server";
import {authBody,authFailure,authHeaders,getAccountStore,requestAccount,sessionCookie} from "@/lib/server/accounts";
import {AccountError} from "@/lib/server/account-store";
import {PaperAccountError,PaperStore} from "@/lib/server/paper-store";
import {DemoOrders} from "@/lib/server/demo-orders";
import {startDemoRunner,demoHealth} from "@/lib/server/demo-runner";
import {orderInput} from "@/lib/paper/orders";
import {getExchange} from "@/lib/market/service";
import {getOrderBook} from "@/lib/market/orderbook/rest";
import {z} from "zod";
import {readPaperPortfolio} from "@/lib/server/paper-portfolio";
function accountSnapshot(owner:string){const account=new PaperStore(getAccountStore().db).read(owner);account.portfolio=readPaperPortfolio(getAccountStore().db,account.id);return account;}
export const runtime="nodejs";
export const dynamic="force-dynamic";
function failure(e:unknown){return authFailure(e instanceof AccountError?e:e instanceof PaperAccountError?new AccountError(e.message,e.status):new AccountError(e instanceof z.ZodError?e.issues[0]?.message||"Проверьте заявку":e instanceof Error?e.message:"Ошибка заявки",e instanceof z.ZodError?400:503));}
export async function GET(request:Request){try{const a=await requestAccount();startDemoRunner();const store=new DemoOrders(getAccountStore().db);const r=NextResponse.json({ownerId:a.session.ownerId,orders:store.list(a.session.ownerId),fills:store.fills(a.session.ownerId),account:accountSnapshot(a.session.ownerId),health:demoHealth()},{headers:authHeaders});return a.fresh?sessionCookie(r,a.token,request):r;}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const body=await authBody(request),a=await requestAccount();if(a.fresh||request.headers.get("X-Workspace-Id")!==a.session.ownerId)throw new AccountError("Аккаунт изменился. Повторите после обновления страницы",409);
  if(body.action==="amend")throw new AccountError("Заявку нельзя редактировать. Отмените её и создайте новую.",400,"ORDER_EDIT_DISABLED");
  const store=new DemoOrders(getAccountStore().db);startDemoRunner();
  if(body.action==="cancel"){const {id}=z.object({action:z.literal("cancel"),id:z.uuid()}).strict().parse(body);store.cancel(a.session.ownerId,id);}else{
    const input=orderInput.parse(body),pair=(await getExchange(input.exchange).getPairs()).find(p=>p.symbol===input.symbol);if(!pair)throw new AccountError("Пара недоступна",400);
    const [book,tickers]=await Promise.all([getOrderBook(input.exchange,input.symbol),getExchange(input.exchange).getTickers([input.symbol])]);const tick=tickers.find(t=>t.symbol===input.symbol);
    if(!tick||Date.now()-tick.receivedAt>5000)throw new AccountError("Нет свежей цены биржи",503);
    store.create(a.session.ownerId,input,pair,tick.lastPrice,book);store.process(book,{price:tick.lastPrice,receivedAt:tick.receivedAt});
  }
  return NextResponse.json({ownerId:a.session.ownerId,orders:store.list(a.session.ownerId),fills:store.fills(a.session.ownerId),account:accountSnapshot(a.session.ownerId),health:demoHealth()},{headers:authHeaders});
}catch(e){return failure(e);}}
