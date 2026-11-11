import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "О проекте",
  description: "Sinex — независимый терминал для анализа публичных данных криптовалютных бирж и учебной DEMO-торговли.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <main className="kb-main"><article className="kb-article kb-about">
    <header><p>О проекте</p><h1>Sinex</h1><div className="kb-lead">Терминал анализа криптовалютного рынка и открытая база знаний.</div></header>
    <div className="kb-prose">
      <h2>Что делает Sinex</h2>
      <p>Sinex объединяет публичные котировки, свечные графики, стаканы и ленты сделок подключённых спотовых бирж. Для обучения доступна DEMO-торговля с виртуальным балансом.</p>
      <h2>Что Sinex не делает</h2>
      <p>Sinex не является брокером, не хранит средства пользователей, не подключается к личным торговым ключам и не отправляет реальные заявки на биржи.</p>
      <h2>Редакционный подход</h2>
      <p>Материалы основаны на фактической реализации Sinex и первичной документации источников. Существенные изменения отражаются в дате обновления статьи. Информация носит образовательный характер.</p>
      <p><Link href="/help">Перейти в справку</Link></p>
    </div>
  </article></main>;
}
