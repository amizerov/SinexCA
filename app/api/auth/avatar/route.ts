import {NextResponse} from "next/server";
import {authBody,authHeaders,getAccountStore,requestAccount} from "@/lib/server/accounts";
import {AccountError} from "@/lib/server/account-store";
import {profileAccount,profileFailure} from "@/lib/server/profile-route";
import {normalizeAvatarPng,MAX_AVATAR_BYTES} from "@/lib/auth/avatar";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function imageBody(request:Request){
  if(request.headers.get("content-type")?.split(";")[0]!=="image/png")throw new AccountError("Выберите изображение PNG, JPEG, WebP, GIF или AVIF в профиле.",400);
  const length=Number(request.headers.get("content-length")||0);if(length>MAX_AVATAR_BYTES)throw new AccountError("Изображение слишком большое.",413);
  const reader=request.body?.getReader();if(!reader)throw new AccountError("Изображение не получено.",400);
  const parts:Buffer[]=[];let size=0;
  try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>MAX_AVATAR_BYTES){await reader.cancel();throw new AccountError("Изображение слишком большое.",413);}parts.push(Buffer.from(result.value));}}finally{reader.releaseLock();}
  try{return normalizeAvatarPng(Buffer.concat(parts));}catch{throw new AccountError("Не удалось прочитать изображение. Выберите фото заново.",400,"INVALID_IMAGE");}
}
export async function POST(request:Request){try{
  const account=await profileAccount(request),image=await imageBody(request),store=getAccountStore();
  if(store.session(account.token)?.user?.id!==account.user.id)throw new AccountError("Войдите в аккаунт заново.",401);
  store.saveAvatar(account.user.id,image);
  return NextResponse.json({data:store.session(account.token),ownerId:account.session.ownerId},{headers:authHeaders});
}catch(error){return profileFailure(error);}}
export async function DELETE(request:Request){try{
  await authBody(request);const account=await profileAccount(request),store=getAccountStore();store.removeAvatar(account.user.id);
  return NextResponse.json({data:store.session(account.token),ownerId:account.session.ownerId},{headers:authHeaders});
}catch(error){return profileFailure(error);}}
export async function GET(request:Request){try{
  const account=await requestAccount(),user=account.session.user;
  if(!user||new URL(request.url).searchParams.get("userId")!==user.id)throw new AccountError("Фото не найдено.",404);
  const row=getAccountStore().db.prepare("SELECT content FROM account_avatar_images WHERE user_id=?").get(user.id);
  if(!row)throw new AccountError("Фото не найдено.",404);
  return new Response(new Uint8Array(row.content as Uint8Array),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":"inline; filename=avatar.png","Referrer-Policy":"no-referrer"}});
}catch(error){return profileFailure(error);}}
