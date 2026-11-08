import "server-only";
import { z } from "zod";
import { MarketError } from "@/lib/market/errors";
import { exchangeQuery } from "@/lib/market/schemas";
export async function marketRoute<T>(request: Request, run: () => Promise<T>) {
  try {
    const { exchange } = parseQuery(exchangeQuery, request);
    const data = await run();
    return Response.json({ data, meta: { exchange, marketType: "spot", fetchedAt: new Date().toISOString() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof MarketError;
    const invalid = error instanceof z.ZodError;
    return Response.json({ error: {
      code: known ? error.code : invalid ? "INVALID_DATA" : "MARKET_ERROR",
      message: known ? error.message : invalid ? "Биржа вернула данные в неожиданном формате." : "Не удалось обработать рыночные данные.",
    } }, { status: known ? error.status : 502, headers: { "Cache-Control": "no-store", ...(known && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  }
}
export function parseQuery<S extends z.ZodType>(schema: S, request: Request): z.output<S> {
  const result = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) throw new MarketError("INVALID_PARAMS", result.error.issues[0]?.message || "Проверьте параметры запроса.", 400);
  return result.data;
}
