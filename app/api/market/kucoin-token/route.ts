import { getKucoinToken } from "@/lib/market/exchanges/kucoin";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ data: await getKucoinToken() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: { code: "STREAM_TOKEN_ERROR", message: "Не удалось подключить публичный поток KuCoin." } }, { status: 502 }); }
}
