import Link from "next/link";
import { BrandMark } from "@/components/market/BrandMark";
import { KnowledgeSearch } from "./KnowledgeSearch";
import type { ArticleMeta } from "@/lib/content/articles";
import { ThemeToggle } from "@/components/ThemeToggle";

export function KnowledgeHeader({ articles }: { articles: ArticleMeta[] }) {
  return (
    <header className="kb-header">
      <Link className="kb-brand" href="/" aria-label="Sinex — терминал">
        <span className="brand-mark"><BrandMark size={22} /></span>
        <span>Sinex <small>knowledge</small></span>
      </Link>
      <nav aria-label="Разделы базы знаний">
        <Link href="/help">Справка</Link>
        <Link href="/learn">Обучение</Link>
        <Link href="/developers">Разработчикам</Link>
        <Link href="/blog">Блог</Link>
        <Link href="/about">О проекте</Link>
      </nav>
      <KnowledgeSearch articles={articles} />
      <ThemeToggle />
      <Link className="kb-terminal-link" href="/">Открыть терминал</Link>
    </header>
  );
}
