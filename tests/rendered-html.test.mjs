import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Sports Research OS", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /WorkBuddy — Sports Research OS/i);
  assert.match(html, /Move one thing forward/i);
  assert.match(html, /Define one result worth finishing today/i);
  assert.match(html, /macOS Calendar \/ Live/i);
  assert.match(html, /Ready for a new focus session/i);
  assert.match(html, /Zotero \/ Live Library/i);
  assert.match(html, /Research debt \/ Kbase/i);
  assert.match(html, /No active project/i);
  assert.match(html, /Loading Kbase records/i);
  assert.match(html, /User Guide/i);
  assert.match(html, /Manuscripts/i);
  assert.match(html, /Library/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("every rendered button declares an interaction handler", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const buttons = source.match(/<button\b(?:(?!>).)*>/gs) ?? [];
  assert.ok(buttons.length > 60, "expected the workbench interaction surface");
  const inertButtons = buttons.filter((button) => !button.includes("onClick="));
  assert.deepEqual(inertButtons, []);
  assert.match(source, /saveRecord/);
  assert.match(source, /deleteRecord/);
  assert.match(source, /Save to Kbase/);
  assert.match(source, /Save to Calendar/);
  assert.match(source, /How to use your workbench/);
  assert.doesNotMatch(source, /Command library/);
});

test("client routes all bridge calls through pairing auth and keeps daily and source scopes explicit", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /Authorization.*Bearer/);
  assert.match(source, /workbuddy-bridge-token/);
  assert.match(source, /task\.date === today/);
  assert.match(source, /sources\.kbase \? recordContext\(state\) : ""/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /Evidence manifest/);
  assert.match(css, /\.focus-session \{ grid-column: 1; min-height: 0;[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /\.debt-table \{[^}]*overflow-x: auto/);
});
