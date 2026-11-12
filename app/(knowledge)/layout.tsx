import { KnowledgeHeader } from "@/components/knowledge/KnowledgeHeader";
import { getAllArticles } from "@/lib/content/articles";
import Link from "next/link";

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <div className="kb-shell">
    <KnowledgeHeader articles={getAllArticles()} />
    {children}
    <footer className="kb-footer">
      <nav aria-label="Основные разделы"><Link href="/">Терминал</Link>{" · "}<Link href="/help">Справка</Link>{" · "}<Link href="/learn">Обучение</Link>{" · "}<Link href="/developers">Разработчикам</Link>{" · "}<Link href="/blog">Блог</Link>{" · "}<Link href="/about">О проекте</Link></nav>
      <span>© {new Date().getFullYear()} Sinex</span>
      <span>Информация носит образовательный характер и не является инвестиционной рекомендацией.</span>
    </footer>
  </div>;
}
