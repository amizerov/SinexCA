import {NextResponse} from "next/server";
import {authBody,authHeaders,getAccountStore} from "@/lib/server/accounts";
import {profileAccount,profileFailure} from "@/lib/server/profile-route";
import {profileNameSchema} from "@/lib/auth/profile";
export const runtime="nodejs";
export async function PATCH(request:Request){try{
  const body=await authBody(request),account=await profileAccount(request),input=profileNameSchema.parse(body),store=getAccountStore();
  store.updateDisplayName(account.user.id,input.displayName);
  return NextResponse.json({data:store.session(account.token),ownerId:account.session.ownerId},{headers:authHeaders});
}catch(error){return profileFailure(error);}}
