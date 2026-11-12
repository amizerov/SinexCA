import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/content/articles";
import { CONTENT_SECTIONS, absoluteUrl } from "@/lib/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getAllArticles().map((article) => ({
    url: absoluteUrl(article.href),
    lastModified: new Date(article.updated),
    changeFrequency: "monthly" as const,
    priority: article.featured ? 0.8 : 0.7,
  }));
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/about"), changeFrequency: "yearly", priority: 0.5 },
    ...CONTENT_SECTIONS.map((section) => ({ url: absoluteUrl(`/${section}`), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...articles,
  ];
}
