import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/auth/types";
import { hashPassword } from "@/lib/auth/password";
import { requestAccount,getAccountStore,sessionCookie,authBody,authFailure,authHeaders } from "@/lib/server/accounts";
import { AccountError } from "@/lib/server/account-store";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const input=registerSchema.parse(await authBody(request)); const current=await requestAccount(),store=getAccountStore();
    if(current.session.user) throw new AccountError("Сначала выйдите из текущего аккаунта.",409);
    store.attempt(input.email);
    const result=store.register(input.email,await hashPassword(input.password),current.session,input.ownerCode);
    store.revoke(current.token);
    return sessionCookie(NextResponse.json({data:result.session},{headers:authHeaders}),result.token,request);
  }catch(error){return authFailure(error);}
}
