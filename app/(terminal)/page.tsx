import { MarketDashboard } from "@/components/market/MarketDashboard";
import { pageMetadata } from "@/lib/content/seo";
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/content/site";

export const metadata = pageMetadata(SITE_TITLE, SITE_DESCRIPTION, "/");

export default function Page() {
  return <MarketDashboard />;
}
