import {NextResponse} from "next/server";
import {z} from "zod";
import {authFailure,authHeaders,getAccountStore,requestAccount} from "@/lib/server/accounts";
import {isSameOrigin} from "@/lib/drawings/same-origin";
import {AccountError} from "@/lib/server/account-store";
import {WorkspaceStore} from "@/lib/server/workspace-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function failure(error:unknown){return authFailure(error instanceof z.ZodError?new AccountError("Проверьте настройки рабочей области.",400,"INVALID_WORKSPACE"):error instanceof AccountError?error:new AccountError("Не удалось сохранить рабочую область.",500));}
async function account(){const value=await requestAccount();if(value.fresh||!value.session.user)throw new AccountError("Для сохранения настроек в аккаунте выполните вход.",401);return value;}
export async function GET(){try{const value=await account();return NextResponse.json({data:new WorkspaceStore(getAccountStore().db).read(value.session.ownerId),ownerId:value.session.ownerId},{headers:authHeaders});}catch(error){return failure(error);}}
export async function PATCH(request:Request){try{
  if(!isSameOrigin(request))throw new AccountError("Недопустимый источник запроса.",403);
  const text=await request.text();if(text.length>65536)throw new AccountError("Слишком большой запрос.",413);
  const body=JSON.parse(text),value=await account();
  if(request.headers.get("X-Workspace-Id")!==value.session.ownerId)throw new AccountError("Аккаунт изменился. Обновите страницу.",409);
  return NextResponse.json({data:new WorkspaceStore(getAccountStore().db).save(value.session.ownerId,body),ownerId:value.session.ownerId},{headers:authHeaders});
}catch(error){return failure(error);}}
