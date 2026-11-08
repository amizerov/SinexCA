import { randomBytes,createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requestAccount,getAccountStore,sessionCookie,authHeaders } from "@/lib/server/accounts";
import { googleConfig } from "@/lib/auth/google";
export const runtime="nodejs";
export async function GET(request:Request) {
  try {
    const config=googleConfig(request),current=await requestAccount();
    const state=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url"),verifier=randomBytes(32).toString("base64url");
    getAccountStore().createOAuth(current.session.ownerId,state,nonce,verifier);
    const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:"code",scope:"openid email profile",state,nonce,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",prompt:"select_account"}).toString();
    const response=NextResponse.redirect(url);Object.entries(authHeaders).forEach(([key,value])=>response.headers.set(key,value));
    response.cookies.set("sinex_oauth",state,{httpOnly:true,sameSite:"lax",secure:config.origin.startsWith("https:"),path:"/api/auth/google",maxAge:600});
    return current.fresh?sessionCookie(response,current.token,request):response;
  }catch {return NextResponse.redirect(new URL("/?auth_error=GOOGLE_UNAVAILABLE",request.url));}
}
