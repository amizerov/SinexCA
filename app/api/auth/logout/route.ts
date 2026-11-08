import { NextResponse } from "next/server";
import { requestAccount,getAccountStore,sessionCookie,authBody,authFailure,authHeaders } from "@/lib/server/accounts";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {await authBody(request);const current=await requestAccount(),store=getAccountStore();store.revoke(current.token);const result=store.createGuest();return sessionCookie(NextResponse.json({data:result.session},{headers:authHeaders}),result.token,request);}
  catch(error){return authFailure(error);}
}
