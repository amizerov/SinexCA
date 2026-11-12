import type { Metadata } from "next";
import { AccountPage } from "@/components/AccountPage";
import { pageMetadata } from "@/lib/content/seo";

export const metadata: Metadata = { ...pageMetadata("Аккаунт — Sinex", "Вход в Sinex и управление профилем пользователя.", "/account"), robots: { index: false, follow: false } };

export default function Page() {
  return <AccountPage />;
}
