import { NextResponse } from "next/server";
import { authBody,authFailure,authHeaders,getAccountStore,requestAccount,sessionCookie } from "@/lib/server/accounts";
import { IndicatorStore } from "@/lib/server/indicator-store";
import { AccountError } from "@/lib/server/account-store";
import { DrawingConflict } from "@/lib/server/drawing-store";
import { z } from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const account=await requestAccount();const response=NextResponse.json({data:new IndicatorStore(getAccountStore().db).read(account.session.ownerId),ownerId:account.session.ownerId},{headers:authHeaders});return account.fresh?sessionCookie(response,account.token,request):response;}catch(error){return authFailure(error);}}
export async function PUT(request:Request){try{
  const body=await authBody(request),account=await requestAccount();
  if(account.fresh||request.headers.get("X-Workspace-Id")!==account.session.ownerId)throw new AccountError("Аккаунт изменился. Перезагрузите страницу.",409);
  return NextResponse.json({data:new IndicatorStore(getAccountStore().db).save(account.session.ownerId,body)},{headers:authHeaders});
}catch(error){return authFailure(error instanceof DrawingConflict?new AccountError(error.message,409,"CONFLICT"):error instanceof z.ZodError?new AccountError("Проверьте периоды, цвета и уровни индикаторов.",400,"INVALID_PARAMS"):error);}}
