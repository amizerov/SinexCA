import {NextResponse} from "next/server";
import {authBody,authHeaders,getAccountStore,sessionCookie} from "@/lib/server/accounts";
import {AccountError} from "@/lib/server/account-store";
import {profileAccount,profileFailure} from "@/lib/server/profile-route";
import {changePasswordSchema} from "@/lib/auth/profile";
import {hashPassword,verifyPassword} from "@/lib/auth/password";
export const runtime="nodejs";
export async function POST(request:Request){try{
  const body=await authBody(request),account=await profileAccount(request),input=changePasswordSchema.parse(body),store=getAccountStore();
  store.attempt(`profile-password:${account.user.id}`);
  const row=store.userByEmail(account.user.email),previous=typeof row?.password_hash==="string"?row.password_hash:null;
  if(previous&&(!input.currentPassword||!await verifyPassword(input.currentPassword,previous)))throw new AccountError("Текущий пароль указан неверно.",400,"WRONG_PASSWORD");
  const result=store.changePassword(account.user.id,account.token,previous,await hashPassword(input.newPassword));
  return sessionCookie(NextResponse.json({data:result.session,ownerId:result.session.ownerId},{headers:authHeaders}),result.token,request);
}catch(error){return profileFailure(error);}}
