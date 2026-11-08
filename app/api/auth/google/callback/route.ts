import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { googleConfig,verifyGoogleIdentity,completeGoogleProfile } from "@/lib/auth/google";
import { tokenHash } from "@/lib/auth/password";
import { requestAccount,getAccountStore,sessionCookie,authHeaders } from "@/lib/server/accounts";
import { AccountError } from "@/lib/server/account-store";
export const runtime="nodejs";
export async function GET(request:Request) {
  let destination=new URL("/",request.url);
  let response:NextResponse;
  try {
    const config=googleConfig(request);destination=new URL("/",config.origin);
    const query=new URL(request.url).searchParams,state=query.get("state"),cookie=(await cookies()).get("sinex_oauth")?.value;
    if(!state || state.length>200 || !cookie || !timingSafeEqual(Buffer.from(tokenHash(state)),Buffer.from(tokenHash(cookie)))) throw new Error("Invalid state");
    const current=await requestAccount(),store=getAccountStore();
    if(current.fresh) throw new Error("Session expired");
    const flow=store.consumeOAuth(state,current.session.ownerId);
    if(!flow || query.has("error") || !query.get("code")) throw new Error("Invalid OAuth flow");
    const result=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:query.get("code")!,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,grant_type:"authorization_code",code_verifier:String(flow.verifier)}),signal:AbortSignal.timeout(12000),cache:"no-store"});
    if(!result.ok) throw new Error("Token exchange failed");
    const tokens=await result.json();if(typeof tokens.id_token!=="string") throw new Error("Missing ID token");
    const identity=await completeGoogleProfile(await verifyGoogleIdentity(tokens.id_token,config.clientId,String(flow.nonce)),tokens.access_token);
    const account=store.google(identity.sub,identity.email,current.session,identity);store.revoke(current.token);
    response=sessionCookie(NextResponse.redirect(destination),account.token,request);
  } catch(error) {
    destination.searchParams.set("auth_error",error instanceof AccountError&&error.code==="LINK_REQUIRED"?"LINK_REQUIRED":"GOOGLE_FAILED");
    response=NextResponse.redirect(destination);
  }
  response.cookies.set("sinex_oauth","",{httpOnly:true,sameSite:"lax",path:"/api/auth/google",maxAge:0});
  Object.entries(authHeaders).forEach(([key,value])=>response.headers.set(key,value));return response;
}
