"use client";

import { useEffect, useState } from "react";

const brandAssets = {
  deepseek: "/brands/deepseek.svg",
  kimi: "/brands/kimi.svg",
  openai: "/brands/openai.svg",
  claude: "/brands/claude.svg",
  grok: "/brands/grok.ico",
  gemini: "/brands/gemini.svg",
  zotero: "/brands/zotero.png",
  obsidian: "/brands/obsidian.svg",
} as const;

export type Brand = keyof typeof brandAssets | "calendar";

function CalendarBrandIcon() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;

    const refresh = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      setToday(now);
      timer = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1_000);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(today);
  const date = today.getDate();

  return (
    <span className="calendar-brand-icon">
      <span className="calendar-brand-weekday" suppressHydrationWarning>
        {weekday}
      </span>
      <span className="calendar-brand-date" suppressHydrationWarning>
        {date}
      </span>
    </span>
  );
}

export function BrandLogo({ brand, className = "" }: { brand: Brand; className?: string }) {
  if (brand === "calendar") {
    return (
      <span className={`brand-logo brand-calendar ${className}`} aria-hidden="true">
        <CalendarBrandIcon />
      </span>
    );
  }

  return (
    <span className={`brand-logo brand-${brand} ${className}`} aria-hidden="true">
      <img src={brandAssets[brand]} alt="" />
    </span>
  );
}
