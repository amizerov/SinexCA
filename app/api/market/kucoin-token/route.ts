import { getKucoinToken } from "@/lib/market/exchanges/kucoin";
import {marketTypeSchema} from "@/lib/market/schemas";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
  const parsed=marketTypeSchema.safeParse(new URL(request.url).searchParams.get("marketType")??"spot");
  if(!parsed.success)return Response.json({error:{code:"INVALID_PARAMS",message:"Неизвестный тип рынка."}},{status:400});
  try { return Response.json({ data: await getKucoinToken(parsed.data) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: { code: "STREAM_TOKEN_ERROR", message: "Не удалось подключить публичный поток KuCoin." } }, { status: 502 }); }
}
