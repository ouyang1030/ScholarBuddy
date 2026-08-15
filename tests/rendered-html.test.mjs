import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// The workbench is split across app/ and shared/, so these assertions read
// every client source rather than a single module. Moving a component or a
// constant between files must not change what the interface is asserted to
// contain.
async function readTree(directory, pattern) {
  const root = new URL(directory, import.meta.url);
  const names = (await readdir(root, { recursive: true }))
    .filter((name) => pattern.test(name))
    .sort();
  return { names, read: Promise.all(names.map((name) => readFile(new URL(name, root), "utf8"))) };
}

async function appSource() {
  const app = await readTree("../app/", /\.(tsx|ts)$/);
  const shared = await readTree("../shared/", /\.mjs$/);
  assert.ok(app.names.length > 0, "expected client sources under app/");
  assert.ok(shared.names.length > 0, "expected shared constants");
  return [...(await app.read), ...(await shared.read)].join("\n");
}

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
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  const html = await response.text();
  assert.match(html, /ScholarBuddy — Sports Research OS/i);
  assert.match(html, /Move one thing forward/i);
  assert.match(html, /Define one result worth finishing today/i);
  assert.match(html, /macOS Calendar \/ Live/i);
  assert.match(html, /Ready for a new focus session/i);
  assert.match(html, /Zotero \/ Live Library/i);
  assert.match(html, /Research debt \/ Obsidian/i);
  assert.match(html, /Research log \/ Obsidian/i);
  assert.match(html, /Idea inbox \/ Obsidian/i);
  assert.match(html, /What actually changed today/i);
  assert.match(html, /Catch it now, judge it later/i);
  assert.match(html, /No active project/i);
  assert.match(html, /Loading Obsidian records/i);
  assert.match(html, /User Guide/i);
  assert.match(html, /Manuscripts/i);
  assert.match(html, /Operations/i);
  assert.match(html, /Library/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("every rendered button declares an interaction handler", async () => {
  const source = await appSource();
  const buttons = source.match(/<button\b(?:(?!>).)*>/gs) ?? [];
  assert.ok(buttons.length > 60, "expected the workbench interaction surface");
  const inertButtons = buttons.filter((button) => !button.includes("onClick="));
  assert.deepEqual(inertButtons, []);
  assert.match(source, /saveRecord/);
  assert.match(source, /deleteRecord/);
  assert.match(source, /Save to Obsidian/);
  assert.match(source, /Save changes/);
  assert.match(source, /Add event/);
  assert.match(source, /How to use your workbench/);
  assert.doesNotMatch(source, /Command library/);
});

test("submission attention cards persist read state and open the matching submission", async () => {
  const source = await appSource();
  assert.match(source, /workbuddy-read-submission-alerts-v1/);
  assert.match(source, /submissionAlertKey\(alert\)/);
  assert.match(source, /setReadSubmissionAlertKeys/);
  assert.match(source, /activeAlertKeys\.has\(key\)/);
  assert.match(source, /openPaper\(alert\.attempt\.manuscriptId \|\| "", "submission"\)/);
  assert.match(source, /onClick=\{\(\) => onOpen\(alert\)\}/);
});

test("client routes all bridge calls through pairing auth and keeps daily and source scopes explicit", async () => {
  const source = await appSource();
  const clientSource = source;
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(clientSource, /Authorization.*Bearer/);
  assert.match(clientSource, /workbuddy-bridge-token/);
  assert.match(clientSource, /NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT/);
  assert.match(clientSource, /\/pair\/exchange/);
  assert.match(source, /Configure this Mac/);
  assert.match(source, /bridge-pair/);
  assert.match(source, /temporary code/i);
  assert.match(source, /task\.date === today/);
  // Capture must reach Obsidian, must be reachable from any module, and must not
  // lose typed text while the Bridge is unavailable.
  assert.match(source, /workbuddy-journal-draft-v1/);
  assert.match(source, /workbuddy-idea-draft-v1/);
  assert.match(source, /workbuddy-capture-focus/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "j"/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "i"/);
  assert.match(source, /saveRecord\("journal"/);
  assert.match(source, /saveRecord\("ideas"/);
  assert.match(source, /status: "Promoted", promotedTo: question\.id/);
  assert.match(source, /"RECENT RESEARCH LOG:"/);
  assert.match(source, /"IDEA INBOX:"/);
  // Unticking the workbench source has to empty both halves of the local context,
  // and a follow-up turn must not resend either: the Bridge already holds them.
  assert.match(source, /continues \|\| !sources\.kbase \? "" : recordContext\(state, paper\?\.id/);
  assert.match(
    source,
    /continues \|\| !sources\.kbase \? \[\] : contextPassages\(state, paper\?\.id/,
  );
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /Evidence manifest/);
  assert.match(source, /ChatGPT/);
  assert.match(source, /Claude/);
  assert.match(source, /Grok/);
  assert.match(source, /Gemini/);
  assert.match(source, /workbuddy-ai-provider/);
  assert.match(source, /manuscriptId/);
  assert.match(source, /projectId/);
  assert.match(source, /One paper, <em>one context/);
  assert.match(source, /workbuddy-focus-en-v2/);
  assert.match(source, /externalId: block\.id/);
  assert.match(source, /workbuddy-calendar-refresh/);
  assert.match(source, /focus-wave \$\{running \? "active" : ""\}/);
  assert.match(source, /seconds < 21600/);
  assert.match(source, /workbuddy-focus-celebrated-date/);
  assert.match(source, /FocusCelebration/);
  assert.match(source, /setCelebrating\(false\), 8000/);
  assert.match(source, /workbuddy-paper-celebrations-v1/);
  assert.match(source, /热烈祝贺/);
  assert.match(source, /Herzlichen Glückwunsch/);
  assert.match(source, /saved\.stage === "Accepted" \|\| saved\.stage === "Published"/);
  assert.match(source, /Focus sessions and research milestones/);
  assert.match(source, /Calendar sync pending/);
  assert.match(source, /project-flow-columns/);
  assert.match(source, /projectId: project\.id, projectTitle: project\.title, stage: "Concept"/);
  assert.doesNotMatch(source, /project-paper-outputs/);
  assert.doesNotMatch(source, /No demo records are shown/);
  assert.doesNotMatch(source, /Create a project to define the dashboard context/);
  assert.doesNotMatch(
    source,
    /Create a paper when a project starts producing a publishable output/,
  );
  assert.doesNotMatch(source, /NEW RECORD/);
  assert.doesNotMatch(source, /Description \/ notes/);
  assert.match(source, /calendarDisplayName/);
  assert.doesNotMatch(source, /Delete this event\?/);
  assert.match(source, /<small>\{calendarDisplayName\(event\.calendar\)\}<\/small>/);
  assert.match(source, /Confirm deletion of \$\{event\.title\}/);
  assert.match(source, /\[\s*6,\s*10,\s*16,\s*23,\s*31,\s*19,\s*28,\s*39/);
  assert.match(source, /aria-label=\{\s*running\s*\?\s*"Pause focus session"/);
  assert.match(source, /aria-label="Reset focus timer"/);
  assert.match(clientSource, /bridgeHealthFetch/);
  assert.match(source, /Passage Library/);
  assert.match(source, /Using Passage Library/);
  assert.match(source, /Hosted access/);
  assert.match(source, /\/zotero\/passages/);
  assert.match(source, /annotationKey/);
  assert.match(source, /Copy Citation/);
  assert.match(source, /words >= 40/);
  assert.doesNotMatch(source, /const page = passage\.pageLabel/);
  assert.match(source, /suggestedPassageSection/);
  assert.match(source, /display === "list"/);
  assert.match(source, /passage-year-block/);
  assert.match(source, /LinkedPassages/);
  assert.match(clientSource, /workbuddy-bridge-url/);
  assert.match(source, /Bridge unreachable · open in a Mac browser/);
  assert.match(css, /\.record-board > \.real-empty \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.real-summary-grid \{ margin-top: 18px;[\s\S]*repeat\(2/);
  assert.match(css, /\.editable-section \{ margin-top: 22px; padding: 24px; \}/);
  assert.match(css, /@keyframes focus-wave-pulse/);
  assert.match(css, /@keyframes firework-spark/);
  assert.match(css, /@keyframes celebration-language/);
  assert.match(css, /\.paper-celebration/);
  assert.match(css, /\.focus-celebration/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(
    css,
    /\.focus-session \{ grid-column: 1; min-height: 0;[\s\S]*grid-template-columns: 1fr/,
  );
  assert.match(css, /\.time-editor-fields \{ display: grid;/);
  assert.match(css, /\.focus-wave \{ grid-column: 2; grid-row: 2 \/ 4;/);
  assert.match(
    css,
    /\.focus-actions \{ width: 86%; justify-self: center; grid-template-columns: repeat\(2, minmax\(0,1fr\)\);/,
  );
  assert.match(css, /\.focus-control-icon\.reset \{[^}]*font-size: 21px/);
  assert.match(
    css,
    /\.schedule-list > div\.confirming-delete \{ grid-template-columns: 48px 17px minmax\(0,1fr\) 128px;/,
  );
  assert.match(css, /\.passage-list \{[^}]*repeat\(2/);
  assert.match(css, /\.passage-organize \{/);
  assert.match(css, /\.linked-passages \{/);
  assert.match(css, /\.passage-list\.list-view/);
  assert.match(css, /\.literature-card > \.section-heading \{ margin-bottom: 18px; \}/);
  assert.match(css, /footer button:nth-child\(n\+4\)/);
});
