import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSectionArticles } from "@/lib/content/articles";
import { CONTENT_SECTIONS, SECTION_META, absoluteUrl, isContentSection } from "@/lib/content/site";

type Props = { params: Promise<{ section: string }> };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return CONTENT_SECTIONS.map((section) => ({ section }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  if (!isContentSection(section)) return {};
  const meta = SECTION_META[section];
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `/${section}` },
    openGraph: { title: meta.title, description: meta.description, url: absoluteUrl(`/${section}`), type: "website" },
  };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  if (!isContentSection(section)) notFound();
  const meta = SECTION_META[section];
  const articles = getSectionArticles(section);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.title,
    description: meta.description,
    url: absoluteUrl(`/${section}`),
    hasPart: articles.map((article) => ({ "@type": "Article", name: article.title, url: absoluteUrl(article.href) })),
  };
  return <main className="kb-main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <header className="kb-hero">
      <p>{meta.eyebrow}</p>
      <h1>{meta.title}</h1>
      <span>{meta.description}</span>
    </header>
    <div className="kb-grid">
      {articles.map((article, index) => <Link className={index === 0 ? "kb-card featured" : "kb-card"} href={article.href} key={article.href}>
        <small>{article.tags.slice(0, 2).join(" · ")}</small>
        <h2>{article.title}</h2>
        <p>{article.description}</p>
        <span>Читать →</span>
      </Link>)}
    </div>
  </main>;
}
