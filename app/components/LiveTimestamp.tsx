"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../i18n";

const options: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};
const stamps = {
  en: new Intl.DateTimeFormat("en-GB", options),
  zh: new Intl.DateTimeFormat("zh-CN", options),
};

/**
 * Owns its own one-second tick so the surrounding dashboard — schedule,
 * literature, submission alerts — is not re-rendered once per second.
 */
export function LiveTimestamp() {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="eyebrow" suppressHydrationWarning>
      <span className="live-time-dot" />
      {stamps[locale].format(now)}
    </p>
  );
}
