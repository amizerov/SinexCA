export const SITE_URL = "https://sinex.argoai.ru";
export const SITE_NAME = "Sinex";
export const SITE_DESCRIPTION =
  "Терминал анализа криптовалютного рынка: котировки, свечные графики, стакан заявок и учебная DEMO-торговля.";

export const CONTENT_SECTIONS = ["help", "learn", "developers", "blog"] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export const SECTION_META: Record<ContentSection, { title: string; description: string; eyebrow: string }> = {
  help: {
    title: "Справка Sinex",
    description: "Руководства по интерфейсу, графикам, стакану заявок и учебной DEMO-торговле в Sinex.",
    eyebrow: "Документация продукта",
  },
  learn: {
    title: "Обучение трейдингу",
    description: "Понятные материалы о свечах, Bid и Ask, стакане, типах заявок и управлении риском.",
    eyebrow: "База знаний",
  },
  developers: {
    title: "Разработчикам",
    description: "Архитектура Sinex, получение публичных рыночных данных и устройство биржевых интеграций.",
    eyebrow: "Техническая документация",
  },
  blog: {
    title: "Блог Sinex",
    description: "Проверенные технические разборы разработки и развития терминала Sinex.",
    eyebrow: "Инженерный журнал",
  },
};

export function isContentSection(value: string): value is ContentSection {
  return CONTENT_SECTIONS.includes(value as ContentSection);
}

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}
