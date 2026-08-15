"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="global-error-body">
        <main className="global-error" role="alert">
          <p className="global-error-kicker">SCHOLARBUDDY</p>
          <h1>The workbench could not be displayed.</h1>
          <p>
            Your Obsidian records, Zotero library, and Calendar are untouched — only this page
            failed to render.
          </p>
          <pre>
            {error.message}
            {error.digest ? `\n\nDigest ${error.digest}` : ""}
          </pre>
          <button onClick={reset}>Reload the workbench</button>
        </main>
      </body>
    </html>
  );
}
