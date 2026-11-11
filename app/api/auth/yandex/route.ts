import {randomBytes,createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {requestAccount,getAccountStore,sessionCookie,authHeaders} from "@/lib/server/accounts";
import {yandexConfig} from "@/lib/auth/yandex";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const config=yandexConfig(request),current=await requestAccount();
    const state=randomBytes(32).toString("base64url"),nonce=`yandex:${randomBytes(32).toString("base64url")}`,verifier=randomBytes(32).toString("base64url");
    getAccountStore().createOAuth(current.session.ownerId,state,nonce,verifier);
    const url=new URL("https://oauth.yandex.ru/authorize");
    url.search=new URLSearchParams({response_type:"code",client_id:config.clientId,redirect_uri:config.redirectUri,scope:"login:email login:info login:avatar",state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",force_confirm:"yes"}).toString();
    const response=NextResponse.redirect(url);Object.entries(authHeaders).forEach(([key,value])=>response.headers.set(key,value));
    response.cookies.set("sinex_yandex_oauth",state,{httpOnly:true,sameSite:"lax",secure:config.origin.startsWith("https:"),path:"/api/auth/yandex",maxAge:600});
    return current.fresh?sessionCookie(response,current.token,request):response;
  }catch{return NextResponse.redirect(new URL("/?auth_error=YANDEX_UNAVAILABLE",request.url));}
}
