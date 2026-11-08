import "server-only";
import { MarketError } from "@/lib/market/errors";

// A rate limit or regional restriction on one exchange must not disable the others.
const blocked = new Map<string, { until: number; error: MarketError }>();
export async function fetchJson(url: URL, method: "GET" | "POST" = "GET"): Promise<unknown> {
  const entry = blocked.get(url.origin);
  if (entry && Date.now() < entry.until) throw entry.error;
  blocked.delete(url.origin);
  try {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(10_000), cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) {
      const retryAfter = Math.min(3600, Math.max(60, Number(response.headers.get("retry-after")) || 60));
      const error = response.status === 429 || response.status === 418
        ? new MarketError("RATE_LIMIT", "Биржа ограничила частоту запросов. Повторите позже.", 429, retryAfter)
        : response.status === 451 || response.status === 403
          ? new MarketError("ACCESS_RESTRICTED", "Биржа ограничила доступ из сети сервера. Проверьте регион хостинга.", 503, retryAfter)
          : response.status === 400
            ? new MarketError("INVALID_SYMBOL", "Биржа не поддерживает эту торговую пару или параметры.", 400)
            : new MarketError("UPSTREAM_ERROR", "Биржа временно недоступна. Повторите запрос позже.");
      if ([429, 418, 451, 403].includes(response.status)) blocked.set(url.origin, { until: Date.now() + retryAfter * 1000, error });
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error instanceof MarketError) throw error;
    throw new MarketError("NETWORK_ERROR", "Не удалось получить данные выбранной биржи. Проверьте соединение или выберите другую биржу.");
  }
}
