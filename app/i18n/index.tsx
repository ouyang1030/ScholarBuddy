"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { en, type Messages } from "./en";
import { zh } from "./zh";
import { HTML_LANG, LOCALE_COOKIE, type Locale } from "./locale";

export type { Locale } from "./locale";
export type { Messages } from "./en";

export const MESSAGES: Record<Locale, Messages> = { en, zh };

const LocaleContext = createContext<{ locale: Locale; setLocale: (next: Locale) => void }>({
  locale: "en",
  setLocale: () => {},
});

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const [locale, setState] = useState<Locale>(initial);
  const setLocale = useCallback((next: Locale) => {
    setState(next);
    document.documentElement.lang = HTML_LANG[next];
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
export const useT = () => MESSAGES[useContext(LocaleContext).locale];

// Stored values — statuses, stages, section names — stay English in the vault.
// This shows one in the current language, and a value the vocabulary does not
// know (typed by hand in Obsidian) as it was written.
export function valueLabel(labels: Record<string, string>, value?: string | null) {
  return value ? (labels[value] ?? value) : "";
}

// A failure the Bridge explains with a code is shown in the current language;
// anything else falls back to the Bridge's own words, then to the caller's.
export class BridgeFailure extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
export function bridgeFailure(body: { error?: string; code?: string } | null, fallback: string) {
  return new BridgeFailure(body?.error || fallback, body?.code);
}
export function failureText(t: Messages, error: unknown, fallback: string) {
  const code = error instanceof BridgeFailure ? error.code : undefined;
  const known = code ? (t.errors as Record<string, string>)[code] : undefined;
  return known || (error instanceof Error && error.message) || fallback;
}
