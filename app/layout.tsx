import type { Metadata } from "next";
import "./globals.css";
import { AccountProvider } from "@/components/Account";
import {WorkspacePreferencesSync} from "@/components/WorkspacePreferencesSync";
export const metadata: Metadata = {
  title: "Sinex broker — крипторынок в реальном времени",
  description: "Реальные котировки Binance Spot, свечные графики и объёмы. Аналитика криптовалют без регистрации.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><AccountProvider><WorkspacePreferencesSync/>{children}</AccountProvider></body></html>;
}
