"use client";

import {Moon, Sun} from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "sinex:theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({className = ""}: {className?: string}) {
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("sinex:theme-change", {detail: next}));
  }

  const label = "Переключить светлую и тёмную тему";
  return (
    <button className={`theme-toggle ${className}`.trim()} type="button" onClick={toggleTheme} aria-label={label} title={label}>
      <Sun className="theme-icon theme-icon-light" size={16} aria-hidden="true" />
      <Moon className="theme-icon theme-icon-dark" size={16} aria-hidden="true" />
    </button>
  );
}
