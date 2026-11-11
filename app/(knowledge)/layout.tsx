import { KnowledgeHeader } from "@/components/knowledge/KnowledgeHeader";
import { getAllArticles } from "@/lib/content/articles";

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <div className="kb-shell">
    <KnowledgeHeader articles={getAllArticles()} />
    {children}
    <footer className="kb-footer">
      <span>© {new Date().getFullYear()} Sinex</span>
      <span>Информация носит образовательный характер и не является инвестиционной рекомендацией.</span>
    </footer>
  </div>;
}
