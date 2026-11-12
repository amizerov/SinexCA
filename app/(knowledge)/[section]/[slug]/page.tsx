import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/components/knowledge/MdxComponents";
import { getAllArticles, getArticle, getSectionArticles } from "@/lib/content/articles";
import { SECTION_META, absoluteUrl, isContentSection } from "@/lib/content/site";
import { breadcrumbs, pageMetadata } from "@/lib/content/seo";

type Props = { params: Promise<{ section: string; slug: string }> };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllArticles().map(({ section, slug }) => ({ section, slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  if (!isContentSection(section)) return {};
  const article = getArticle(section, slug);
  if (!article) return {};
  const title = /\bSinex\b/i.test(article.title) ? article.title : `${article.title} — Sinex`;
  const meta = pageMetadata(title, article.description, article.href);
  return {
    ...meta,
    authors: [{ name: article.author }],
    openGraph: {
      ...meta.openGraph,
      type: "article",
      description: article.description,
      url: absoluteUrl(article.href),
      publishedTime: article.date,
      modifiedTime: article.updated,
      tags: article.tags,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { section, slug } = await params;
  if (!isContentSection(section)) notFound();
  const article = getArticle(section, slug);
  if (!article) notFound();
  const sectionArticles = getSectionArticles(section);
  const related = article.related
    .map((relatedSlug) => sectionArticles.find((item) => item.slug === relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const articleType = section === "developers" ? "TechArticle" : "Article";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": articleType,
      headline: article.title,
      description: article.description,
      datePublished: article.date,
      dateModified: article.updated,
      mainEntityOfPage: absoluteUrl(article.href),
      url: absoluteUrl(article.href),
      inLanguage: "ru",
      author: { "@type": "Organization", name: article.author, url: absoluteUrl("/about") },
    },
    breadcrumbs([{ name: SECTION_META[section].title, path: `/${section}` }, { name: article.title, path: article.href }]),
  ];

  return <main className="kb-article-layout">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <article className="kb-article">
      <nav className="kb-breadcrumbs" aria-label="Хлебные крошки">
        <Link href="/">Sinex</Link><span>/</span><Link href={`/${section}`}>{SECTION_META[section].title}</Link><span>/</span><span>{article.title}</span>
      </nav>
      <header>
        <p>{article.tags.join(" · ")}</p>
        <h1>{article.title}</h1>
        <div className="kb-lead">{article.description}</div>
        <div className="kb-byline"><span>{article.author}</span><span>Обновлено {new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(article.updated))}</span></div>
      </header>
      <div className="kb-prose"><MDXRemote source={article.source} components={mdxComponents} /></div>
      {article.sources.length > 0 && <section className="kb-sources"><h2>Источники</h2><ol>{article.sources.map((source) => <li key={source.url}><a href={source.url} rel="noopener noreferrer">{source.title}</a></li>)}</ol></section>}
      {related.length > 0 && <section className="kb-related"><h2>Связанные материалы</h2>{related.map((item) => <Link href={item.href} key={item.href}>{item.title}<span>→</span></Link>)}</section>}
    </article>
    {article.headings.length > 0 && <aside className="kb-toc"><strong>На этой странице</strong>{article.headings.map((heading) => <a className={heading.level === 3 ? "nested" : ""} href={`#${heading.id}`} key={`${heading.level}:${heading.id}`}>{heading.text}</a>)}</aside>}
  </main>;
}
