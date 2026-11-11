"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArticleMeta } from "@/lib/content/articles";
import { SECTION_META } from "@/lib/content/site";

export function KnowledgeSearch({ articles }: { articles: ArticleMeta[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    if (!needle) return articles.slice(0, 8);
    return articles.filter((article) =>
      [article.title, article.description, ...article.tags, article.searchText].join(" ").toLocaleLowerCase("ru").includes(needle),
    ).slice(0, 12);
  }, [articles, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.showModal();
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function open() {
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }

  return <>
    <button className="kb-search-trigger" type="button" onClick={open} aria-label="Поиск по базе знаний">
      <Search size={15} /><span>Поиск</span><kbd>Ctrl K</kbd>
    </button>
    <dialog className="kb-search-dialog" ref={dialog} onClose={() => setQuery("")}>
      <form method="dialog" className="kb-search-box">
        <Search size={18} />
        <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти статью…" aria-label="Поисковый запрос" />
        <button aria-label="Закрыть поиск"><X size={17} /></button>
      </form>
      <div className="kb-search-results">
        {results.map((article) => <Link href={article.href} key={article.href} onClick={() => dialog.current?.close()}>
          <small>{SECTION_META[article.section].title}</small>
          <strong>{article.title}</strong>
          <span>{article.description}</span>
        </Link>)}
        {!results.length && <p>Ничего не найдено. Попробуйте изменить запрос.</p>}
      </div>
    </dialog>
  </>;
}
