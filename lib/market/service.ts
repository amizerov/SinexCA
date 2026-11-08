import "server-only";
import type { ExchangeId } from "./types";
import { MarketError } from "./errors";
import { exchangeRegistry } from "./exchanges/registry";
export function getExchange(id: ExchangeId) { return exchangeRegistry[id]; }
export async function validateSymbols(id: ExchangeId, symbols: string[]) {
  const pairs = await getExchange(id).getPairs();
  const allowed = new Set(pairs.map(p => p.symbol));
  if (symbols.some(symbol => !allowed.has(symbol))) throw new MarketError("INVALID_SYMBOL", "Пара недоступна в списке выбранной биржи. Обновите список пар.", 400);
}
