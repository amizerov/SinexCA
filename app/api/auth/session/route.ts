import { NextResponse } from "next/server";
import { requestAccount, sessionCookie, authHeaders, authFailure } from "@/lib/server/accounts";
import { googleAvailable } from "@/lib/auth/google";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {const account=await requestAccount();const response=NextResponse.json({data:{...account.session,googleAvailable:googleAvailable()}},{headers:authHeaders});return account.fresh?sessionCookie(response,account.token,request):response;}
  catch(error){return authFailure(error);}
}
