"use client";

import { useLocale, useT } from "../i18n";
import { HTML_LANG, type Locale } from "../i18n/locale";

// The button offers the other language, named in itself, so whoever cannot
// read the current one can still find their own.
const OFFER: Record<Locale, { next: Locale; mark: string; name: string }> = {
  en: { next: "zh", mark: "中", name: "中文" },
  zh: { next: "en", mark: "EN", name: "English" },
};

export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const offer = OFFER[locale];
  const label = t.common.switchLanguage(offer.name);
  return (
    <button
      className="language-button"
      lang={HTML_LANG[offer.next]}
      aria-label={label}
      title={label}
      onClick={() => setLocale(offer.next)}
    >
      {offer.mark}
    </button>
  );
}
