import { ImageResponse } from "next/og";

export const alt = "Sinex — терминал анализа криптовалютного рынка";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0b100e", color: "#e5ebe5", fontFamily: "Arial" }}>
    <div style={{ color: "#b4ed8b", fontSize: 32, marginBottom: 28 }}>SINEX</div>
    <div style={{ fontSize: 72, lineHeight: 1.05, maxWidth: 980 }}>Анализ криптовалютного рынка</div>
    <div style={{ fontSize: 30, color: "#9aaa9d", marginTop: 34 }}>Графики · Стакан · DEMO-торговля · База знаний</div>
  </div>, size);
}
