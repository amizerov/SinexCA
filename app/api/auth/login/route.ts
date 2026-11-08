import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/auth/types";
import { verifyPassword } from "@/lib/auth/password";
import { requestAccount,getAccountStore,sessionCookie,authBody,authFailure,authHeaders } from "@/lib/server/accounts";
import { AccountError } from "@/lib/server/account-store";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const input=loginSchema.parse(await authBody(request)),store=getAccountStore();store.attempt(input.email);
    const user=store.userByEmail(input.email);
    if(!await verifyPassword(input.password,typeof user?.password_hash==="string"?user.password_hash:null)) throw new AccountError("Неверный email или пароль.",401);
    const current=await requestAccount();
    if(current.session.user) throw new AccountError("Сначала выйдите из текущего аккаунта.",409);
    const result=store.login(String(user!.id),current.session);store.revoke(current.token);
    return sessionCookie(NextResponse.json({data:result.session},{headers:authHeaders}),result.token,request);
  }catch(error){return authFailure(error);}
}
