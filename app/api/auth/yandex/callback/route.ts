import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {yandexConfig,exchangeYandexCode,YandexAuthError} from "@/lib/auth/yandex";
import {tokenHash} from "@/lib/auth/password";
import {requestAccount,getAccountStore,sessionCookie,authHeaders} from "@/lib/server/accounts";
export const runtime="nodejs";
export async function GET(request:Request){
  let destination=new URL("/",request.url),response:NextResponse,stage="config";
  try{
    const config=yandexConfig(request);destination=new URL("/",config.origin);
    stage="state";
    const query=new URL(request.url).searchParams,state=query.get("state"),cookie=(await cookies()).get("sinex_yandex_oauth")?.value;
    if(!state||state.length>200||!cookie||!timingSafeEqual(Buffer.from(tokenHash(state)),Buffer.from(tokenHash(cookie))))throw new YandexAuthError("YANDEX_STATE_EXPIRED");
    stage="session";
    const current=await requestAccount(),store=getAccountStore();if(current.fresh)throw new YandexAuthError("YANDEX_STATE_EXPIRED");
    stage="flow";
    const flow=store.consumeOAuth(state,current.session.ownerId),code=query.get("code");
    if(!flow||!String(flow.nonce).startsWith("yandex:"))throw new YandexAuthError("YANDEX_STATE_EXPIRED");
    if(query.has("error"))throw new YandexAuthError(query.get("error")==="unauthorized_client"?"YANDEX_APP_REJECTED":query.get("error")==="access_denied"?"YANDEX_ACCESS_DENIED":"YANDEX_PROVIDER_FAILED");
    if(!code||code.length>2048)throw new YandexAuthError("YANDEX_CODE_EXPIRED");
    stage="exchange_profile";
    const identity=await exchangeYandexCode(config,code,String(flow.verifier));
    stage="account";
    const account=store.yandex(identity.sub,identity.email,current.session,identity);store.revoke(current.token);
    response=sessionCookie(NextResponse.redirect(destination),account.token,request);
  }catch(error){
    const accountCode=error&&typeof error==="object"&&"code" in error&&typeof error.code==="string"&&/^[A-Z_]{1,64}$/.test(error.code)?error.code:undefined;
    const code=accountCode==="LINK_REQUIRED"?"LINK_REQUIRED":error instanceof YandexAuthError?error.code:error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)?"YANDEX_TIMEOUT":"YANDEX_FAILED";
    // Never log OAuth codes, tokens, provider response bodies or profile/email data.
    const errorType=error instanceof Error?error.name:"unknown";
    const reason=error instanceof TypeError&&error.message.includes("is not a function")?"missing_method":error instanceof Error&&error.message==="fetch failed"?"fetch_failed":undefined;
    const databaseCode=error&&typeof error==="object"&&"code" in error&&typeof error.code==="string"&&/^ERR_SQLITE_[A-Z_]+$/.test(error.code)?error.code:undefined;
    const databaseDetail=error instanceof Error&&/^(?:no such (?:table|column):|UNIQUE constraint failed:|NOT NULL constraint failed:|FOREIGN KEY constraint failed|database is locked|database is not open|The database connection is not open|cannot (?:start|commit|rollback)|table \w+ has no column named)/.test(error.message)?error.message.slice(0,200):undefined;
    console.warn(`[Yandex OAuth] ${JSON.stringify({stage,code,errorType,reason,accountCode,databaseCode,databaseDetail})}`);
    destination.searchParams.set("auth_error",code);
    if(code==="LINK_REQUIRED")destination.searchParams.set("auth_provider","yandex");
    response=NextResponse.redirect(destination);
  }
  response.cookies.set("sinex_yandex_oauth","",{httpOnly:true,sameSite:"lax",path:"/api/auth/yandex",maxAge:0});
  Object.entries(authHeaders).forEach(([key,value])=>response.headers.set(key,value));return response;
}
