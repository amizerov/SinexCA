import "server-only";
import type { ExchangeId,MarketType } from "./types";
import {getFuturesExchange} from "./exchanges/futures";
import { MarketError } from "./errors";
import { exchangeRegistry } from "./exchanges/registry";
export function getExchange(id: ExchangeId,marketType:MarketType="spot") { return marketType==="futures"?getFuturesExchange(id):exchangeRegistry[id]; }
export async function validateSymbols(id: ExchangeId, symbols: string[],marketType:MarketType="spot") {
  const pairs = await getExchange(id,marketType).getPairs();
  const allowed = new Set(pairs.map(p => p.symbol));
  if (symbols.some(symbol => !allowed.has(symbol))) throw new MarketError("INVALID_SYMBOL", "Пара недоступна в списке выбранной биржи. Обновите список пар.", 400);
}
