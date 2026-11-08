import {NextResponse} from "next/server";
import {z} from "zod";
import {authBody,authFailure,authHeaders,getAccountStore,requestAccount,sessionCookie} from "@/lib/server/accounts";
import {AccountError} from "@/lib/server/account-store";
import {PaperStore,PaperAccountError} from "@/lib/server/paper-store";
import {readPaperPortfolio} from "@/lib/server/paper-portfolio";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function failure(error:unknown){return authFailure(error instanceof PaperAccountError?new AccountError(error.message,error.status,error.code):error instanceof z.ZodError?new AccountError(error.issues[0]?.message||"Проверьте сумму пополнения.",400,"INVALID_AMOUNT"):error instanceof SyntaxError?new AccountError("Некорректный запрос пополнения.",400):new AccountError(error instanceof AccountError?error.message:"Не удалось обновить тестовый счёт.",error instanceof AccountError?error.status:500));}
export async function GET(request:Request){try{
  const raw=new URL(request.url).searchParams.get("offset")||"0",offset=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(offset)||offset>1000000)throw new AccountError("Некорректная страница истории.",400);
  const account=await requestAccount(),data=new PaperStore(getAccountStore().db).read(account.session.ownerId,offset);
  data.portfolio=readPaperPortfolio(getAccountStore().db,data.id);
  const response=NextResponse.json({data,ownerId:account.session.ownerId},{headers:authHeaders});
  return account.fresh?sessionCookie(response,account.token,request):response;
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
  const body=await authBody(request),account=await requestAccount();
  if(account.fresh||request.headers.get("X-Workspace-Id")!==account.session.ownerId)throw new AccountError("Аккаунт изменился. Обновите страницу перед пополнением.",409);
  const data=new PaperStore(getAccountStore().db).deposit(account.session.ownerId,body);
  data.portfolio=readPaperPortfolio(getAccountStore().db,data.id);
  return NextResponse.json({data,ownerId:account.session.ownerId},{headers:authHeaders});
}catch(error){return failure(error);}}
