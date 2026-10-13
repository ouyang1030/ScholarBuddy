"use client";

import { MESSAGES } from "./i18n";
import { HTML_LANG, resolveLocale } from "./i18n/locale";

// This replaces the whole document, provider included, so it reads the language
// choice straight from the cookie.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = resolveLocale(
    typeof document === "undefined" ? null : document.cookie,
    typeof navigator === "undefined" ? null : navigator.language,
  );
  const t = MESSAGES[locale];
  return (
    <html lang={HTML_LANG[locale]}>
      <body className="global-error-body">
        <main className="global-error" role="alert">
          <p className="global-error-kicker">SCHOLARBUDDY</p>
          <h1>{t.shell.crashTitle}</h1>
          <p>{t.shell.crashDetail}</p>
          <pre>
            {error.message}
            {error.digest ? `\n\nDigest ${error.digest}` : ""}
          </pre>
          <button onClick={reset}>{t.shell.reload}</button>
        </main>
      </body>
    </html>
  );
}
