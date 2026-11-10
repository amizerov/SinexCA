import type { Metadata } from "next";
import "./globals.css";
import { AccountProvider } from "@/components/Account";
import {WorkspacePreferencesSync} from "@/components/WorkspacePreferencesSync";
import {cookies} from "next/headers";
import {getAccountStore,SESSION_COOKIE} from "@/lib/server/accounts";
import {googleAvailable} from "@/lib/auth/google";
export const metadata: Metadata = {
  title: "Sinex broker — крипторынок в реальном времени",
  description: "Реальные котировки Binance Spot, свечные графики и объёмы. Аналитика криптовалют без регистрации.",
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let initialSession=null;
  try {
    const token=(await cookies()).get(SESSION_COOKIE)?.value;
    const session=token?getAccountStore().session(token):null;
    if(session)initialSession={...session,googleAvailable:googleAvailable()};
  } catch {/* Market data remains available if account storage is unavailable. */}
  return <html lang="ru"><body><AccountProvider initialSession={initialSession}><WorkspacePreferencesSync/>{children}</AccountProvider></body></html>;
}
