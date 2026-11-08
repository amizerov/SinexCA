export class MarketError extends Error {
  constructor(public code: string, message: string, public status = 502, public retryAfter?: number) { super(message); }
}
