const colors: Record<string, string> = { BTC: "#f7931a", ETH: "#7d91e5", SOL: "#9370ef", BNB: "#edc343", XRP: "#92a1b4", DOGE: "#c4a447", ADA: "#397dde", TRX: "#ef535d", LINK: "#4775ed", AVAX: "#e75c5c", SUI: "#69b7f1", LTC: "#7393c5", BCH: "#57ba82", DOT: "#e563a0", NEAR: "#81d9b2", UNI: "#eb71b1", APT: "#82c5ba", TON: "#4fa7df", PEPE: "#74a55d", AAVE: "#9f8acb" };
const marks: Record<string, string> = { BTC: "₿", ETH: "Ξ", SOL: "≋", BNB: "◇", XRP: "×", DOGE: "Ð", ADA: "₳", TRX: "▽", LTC: "Ł", DOT: "●", TON: "▽" };
export function CoinIcon({ asset, small = false }: { asset: string; small?: boolean }) {
  return <span aria-hidden="true" className={`coin-icon ${small ? "small" : ""}`} style={{ "--coin": colors[asset] || "#82918d" } as React.CSSProperties}>{marks[asset] || asset.slice(0, 1)}</span>;
}
