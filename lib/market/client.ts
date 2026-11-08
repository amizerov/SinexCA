import type { MarketResponse } from "./types";
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function getMarket<T>(url: string, signal: AbortSignal): Promise<T> {
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store" });
    let json;
    try { json = await response.json(); }
    catch { throw new ApiError("Сервер вернул некорректный ответ. Повторите загрузку.", "INVALID_RESPONSE", response.status); }
    if (!response.ok) throw new ApiError(json.error?.message || "Не удалось загрузить данные.", json.error?.code || "REQUEST_ERROR", response.status);
    if (!json || typeof json !== "object" || !("data" in json)) throw new ApiError("В ответе сервера отсутствуют рыночные данные.", "INVALID_RESPONSE", 502);
    return (json as MarketResponse<T>).data;
  } catch (error) {
    if (signal.aborted || error instanceof ApiError) throw error;
    throw new ApiError("Не удалось загрузить данные с сервера. Проверьте подключение или повторите запрос.", "CONNECTION_ERROR", 0);
  }
}
export function isPermanentError(error: unknown) {
  return error instanceof ApiError && [400, 403, 429, 503].includes(error.status);
}
