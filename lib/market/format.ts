export function price(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: value >= 1 ? 2 : 4, maximumFractionDigits: value >= 1 ? 2 : 8 }).format(value);
}
export function compact(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
export function percent(value: number | null | undefined) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
export const coinNames: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP", DOGE: "Dogecoin", ADA: "Cardano", TRX: "TRON", LINK: "Chainlink", AVAX: "Avalanche", SUI: "Sui", LTC: "Litecoin", BCH: "Bitcoin Cash", DOT: "Polkadot", NEAR: "NEAR Protocol", UNI: "Uniswap", APT: "Aptos", TON: "Toncoin", PEPE: "Pepe", AAVE: "Aave" };
