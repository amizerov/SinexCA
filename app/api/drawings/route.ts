import { z } from "zod";
import { drawingScopeSchema, saveDrawingSchema } from "@/lib/drawings/types";
import { getAccountStore, requestAccount, sessionCookie } from "@/lib/server/accounts";
import { PrivateDrawingStore } from "@/lib/server/private-drawing-store";
import { NextResponse } from "next/server";
import { DrawingConflict } from "@/lib/server/drawing-store";
import { isSameOrigin } from "@/lib/drawings/same-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const conflict = error instanceof DrawingConflict;
  const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
  return Response.json({ error: { code: conflict ? "CONFLICT" : invalid ? "INVALID_PARAMS" : "STORAGE_ERROR", message: conflict ? error.message : invalid ? "Проверьте пару, цену и цвет уровня." : "Не удалось сохранить или загрузить разметку. Проверьте доступ к файлу базы." } }, { status: conflict ? 409 : invalid ? 400 : 500, headers });
}
export async function GET(request: Request) {
  try { const scope = drawingScopeSchema.parse(Object.fromEntries(new URL(request.url).searchParams)); const account=await requestAccount(); const response=NextResponse.json({ data: new PrivateDrawingStore(getAccountStore().db).read(account.session.ownerId,scope),ownerId:account.session.ownerId }, { headers }); return account.fresh?sessionCookie(response,account.token,request):response; }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    if (!isSameOrigin(request)) return Response.json({ error: { code: "FORBIDDEN", message: "Недопустимый источник запроса." } }, { status: 403, headers });
    const body = await request.text();
    if (body.length > 32000) return Response.json({ error: { code: "TOO_LARGE", message: "Слишком много данных разметки." } }, { status: 413, headers });
    const input = saveDrawingSchema.parse(JSON.parse(body));
    const account=await requestAccount();
    if(account.fresh || request.headers.get("X-Workspace-Id")!==account.session.ownerId) return Response.json({error:{code:"WORKSPACE_CHANGED",message:"Аккаунт изменился или сессия истекла. Перезагрузите страницу перед сохранением."}},{status:409,headers});
    return Response.json({ data: new PrivateDrawingStore(getAccountStore().db).save(account.session.ownerId,input) }, { headers });
  } catch (error) { return failure(error); }
}
