import type { Metadata } from "next";
import { AccountPage } from "@/components/AccountPage";

export const metadata: Metadata = { title: "Аккаунт", alternates: { canonical: "/account" }, robots: { index: false, follow: false } };

export default function Page() {
  return <AccountPage />;
}
