import { AccountProvider } from "@/components/Account";
import { WorkspacePreferencesSync } from "@/components/WorkspacePreferencesSync";
import { cookies } from "next/headers";
import { getAccountStore, SESSION_COOKIE } from "@/lib/server/accounts";
import { googleAvailable } from "@/lib/auth/google";
import { yandexAvailable } from "@/lib/auth/yandex";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  let initialSession = null;
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = token ? getAccountStore().session(token) : null;
    if (session) initialSession = { ...session, googleAvailable: googleAvailable(), yandexAvailable: yandexAvailable() };
  } catch {/* Market data remains available if account storage is unavailable. */}
  return <AccountProvider initialSession={initialSession}><WorkspacePreferencesSync />{children}</AccountProvider>;
}
