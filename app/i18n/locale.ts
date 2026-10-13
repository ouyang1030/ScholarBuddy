// Shared by the server render and the browser, so it holds no React state.
export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

// The choice is a cookie rather than browser storage because the server has to
// render the first frame in the right language; otherwise every Chinese page
// would flash English before it switched.
export const LOCALE_COOKIE = "scholarbuddy-locale";

export const HTML_LANG: Record<Locale, string> = { en: "en", zh: "zh-CN" };

// An explicit choice wins. Without one, the browser's first preference decides,
// and any Chinese variant is served Simplified Chinese.
export function resolveLocale(cookie: string | null, acceptLanguage: string | null): Locale {
  const chosen = cookie?.match(/(?:^|;\s*)scholarbuddy-locale=(en|zh)(?:;|$)/)?.[1];
  if (chosen === "en" || chosen === "zh") return chosen;
  const first = (acceptLanguage || "").split(",")[0]?.trim().toLowerCase() || "";
  return first.startsWith("zh") ? "zh" : "en";
}
