import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { CONTENT_SECTIONS, type ContentSection } from "./site";

const contentRoot = path.join(process.cwd(), "content");

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().min(1),
  updated: z.string().min(1),
  author: z.string().min(1).default("Команда Sinex"),
  order: z.coerce.number().int().default(100),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
});

export type ArticleMeta = z.infer<typeof frontmatterSchema> & {
  section: ContentSection;
  slug: string;
  href: string;
  searchText: string;
};

export type Article = ArticleMeta & { source: string; headings: { id: string; text: string; level: number }[] };

function articlePath(section: ContentSection, slug: string) {
  return path.join(contentRoot, section, `${slug}.mdx`);
}

function toId(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headings(source: string) {
  return source
    .split("\n")
    .map((line) => /^(#{2,3})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ level: match[1].length, text: match[2].replace(/[*_`]/g, ""), id: toId(match[2]) }));
}

function searchableText(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArticle(section: ContentSection, slug: string): Article {
  const file = articlePath(section, slug);
  const parsed = matter(fs.readFileSync(file, "utf8"));
  const metadata = frontmatterSchema.parse(parsed.data);
  return {
    ...metadata,
    section,
    slug,
    href: `/${section}/${slug}`,
    searchText: searchableText(parsed.content),
    source: parsed.content,
    headings: headings(parsed.content),
  };
}

export function getArticle(section: ContentSection, slug: string) {
  const file = articlePath(section, slug);
  if (!fs.existsSync(file)) return undefined;
  const article = parseArticle(section, slug);
  return article.draft ? undefined : article;
}

export function getSectionArticles(section: ContentSection): ArticleMeta[] {
  const directory = path.join(contentRoot, section);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => parseArticle(section, file.slice(0, -4)))
    .filter((article) => !article.draft)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"))
    .map((article) => ({
      title: article.title,
      description: article.description,
      date: article.date,
      updated: article.updated,
      author: article.author,
      order: article.order,
      featured: article.featured,
      draft: article.draft,
      tags: article.tags,
      related: article.related,
      sources: article.sources,
      section: article.section,
      slug: article.slug,
      href: article.href,
      searchText: article.searchText,
    }));
}

export function getAllArticles() {
  return CONTENT_SECTIONS.flatMap(getSectionArticles);
}
