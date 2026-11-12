import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "./site";

// Nested metadata is replaced by Next.js; set page-specific social fields together.
export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title: { absolute: title }, description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      type: "website", locale: "ru_RU", siteName: SITE_NAME,
      title, description, url: absoluteUrl(path),
    },
    twitter: { card: "summary", title, description },
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [{ name: SITE_NAME, path: "/" }, ...items].map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
}
