import "server-only";
import { resolve } from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AccountStore, SESSION_MAX_AGE, AccountError } from "./account-store";
import { isSameOrigin } from "@/lib/drawings/same-origin";
import { z } from "zod";
export const SESSION_COOKIE = "sinex_session";
const STORE_VERSION=7;
const singleton=globalThis as typeof globalThis & {sinexAccountStore?:AccountStore;sinexAccountStoreVersion?:number};
export function getAccountStore() {
  // Development HMR otherwise retains an instance whose methods predate profile support.
  if(singleton.sinexAccountStore&&singleton.sinexAccountStoreVersion!==STORE_VERSION){singleton.sinexAccountStore.close();singleton.sinexAccountStore=undefined;}
  if(!singleton.sinexAccountStore){singleton.sinexAccountStore=new AccountStore(resolve(/*turbopackIgnore: true*/ process.env.SINEX_DB_PATH || "data/sinex.sqlite"));singleton.sinexAccountStoreVersion=STORE_VERSION;}
  return singleton.sinexAccountStore;
}
export async function requestAccount() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const store=getAccountStore(), session=store.session(token);
  return session ? {token:token!,session,fresh:false} : {...store.createGuest(),fresh:true};
}
export function sessionCookie(response:NextResponse, token:string, request:Request) {
  response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:new URL(process.env.SINEX_APP_URL || request.url).protocol==="https:",path:"/",maxAge:SESSION_MAX_AGE});
  return response;
}
export const authHeaders={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
export function authFailure(error:unknown) {
  const invalid=error instanceof z.ZodError || error instanceof SyntaxError;
  return NextResponse.json({error:{code:error instanceof AccountError ? error.code : invalid ? "INVALID_PARAMS":"AUTH_ERROR",message:error instanceof AccountError ? error.message : invalid ? "Проверьте email и пароль (от 10 символов при регистрации).":"Не удалось выполнить вход. Попробуйте ещё раз."}},{status:error instanceof AccountError?error.status:invalid?400:500,headers:authHeaders});
}
export async function authBody(request:Request) {
  if(!isSameOrigin(request)) throw new AccountError("Недопустимый источник запроса.",403);
  const text=await request.text();if(text.length>4096) throw new AccountError("Слишком большой запрос.",413);
  return JSON.parse(text);
}
