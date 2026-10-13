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

async function render(headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", ...headers } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Sports Research OS", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const policy = response.headers.get("content-security-policy") ?? "";
  assert.match(policy, /frame-ancestors 'none'/);
  // A paired page can reach the researcher's Bridge, so scripts run by nonce only.
  const nonce = policy.match(/script-src [^;]*'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "expected a per-request script nonce");
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  assert.ok(scripts.length > 0, "expected the page to ship scripts");
  assert.deepEqual(
    scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`)),
    [],
  );
  const again = (await render()).headers.get("content-security-policy") ?? "";
  assert.notEqual(again.match(/'nonce-([^']+)'/)?.[1], nonce);
  // A prefetched page may be the one the browser shows, so it needs a nonce too.
  for (const header of [{ purpose: "prefetch" }, { "next-router-prefetch": "1" }]) {
    const prefetched = await render(header);
    const prefetchPolicy = prefetched.headers.get("content-security-policy") ?? "";
    const prefetchNonce = prefetchPolicy.match(/script-src [^;]*'nonce-([^']+)'/)?.[1];
    assert.ok(prefetchNonce, `expected a nonce for ${JSON.stringify(header)}`);
    if ((prefetched.headers.get("content-type") ?? "").startsWith("text/html"))
      assert.deepEqual(
        ((await prefetched.text()).match(/<script\b[^>]*>/g) ?? []).filter(
          (tag) => !tag.includes(`nonce="${prefetchNonce}"`),
        ),
        [],
      );
  }
  // The page's own address comes from the host the request was routed by, never
  // from a header any visitor can set.
  const hosted = await (
    await render({ host: "www.scholarbuddy.tech", "x-forwarded-host": "attacker.example" })
  ).text();
  assert.match(hosted, /property="og:image" content="https:\/\/www\.scholarbuddy\.tech\/og\.png"/);
  assert.doesNotMatch(hosted, /attacker\.example/);
  assert.match(html, /ScholarBuddy — Sports Research OS/i);
  assert.match(html, /Move one thing forward/i);
  assert.match(html, /Define one result worth finishing today/i);
  assert.match(html, /TODAY’S SCHEDULE/);
  assert.match(html, /Preparing focus timer/i);
  assert.match(html, /LIVE LIBRARY/i);
  assert.match(html, /PAPER FEEDBACK/);
  assert.match(html, /RESEARCH LOG/);
  assert.match(html, /IDEA INBOX/);
  assert.match(html, /What changed today\?/);
  assert.match(html, /Capture an idea…/);
  assert.match(html, /No active project/i);
  assert.match(html, /Loading records…/);
  assert.match(html, /About ScholarBuddy/i);
  assert.match(html, /Manuscripts/i);
  assert.match(html, /Operations/i);
  assert.match(html, /Library/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("every rendered button declares an interaction handler", async () => {
  const source = await appSource();
  const buttons = source.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
  assert.ok(buttons.length > 60, "expected the workbench interaction surface");
  const inertButtons = buttons.filter(
    (button) => !button.includes("onClick=") && !/type="submit"/.test(button),
  );
  assert.deepEqual(inertButtons, []);
  assert.match(source, /saveRecord/);
  assert.match(source, /deleteRecord/);
  assert.match(source, /Save to Obsidian/);
  assert.match(source, /Save changes/);
  assert.match(source, /Add event/);
  assert.match(source, /How to use your workbench/);
  assert.doesNotMatch(source, /Command library/);
});

test("the macOS Calendar brand follows the browser's current day", async () => {
  const source = await readFile(
    new URL("../app/components/BrandLogo.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /Intl\.DateTimeFormat\("en-US", \{ weekday: "short" \}\)/);
  assert.match(source, /today\.getDate\(\)/);
  assert.match(source, /nextMidnight/);
  assert.match(source, /visibilitychange/);
  assert.match(css, /\.calendar-brand-weekday/);
  assert.match(css, /\.calendar-brand-date/);
});

test("submission attention cards persist read state and open the matching submission", async () => {
  const source = await appSource();
  assert.match(source, /scholarbuddy-read-submission-alerts-v1/);
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
  assert.match(clientSource, /scholarbuddy-bridge-token/);
  assert.match(clientSource, /NEXT_PUBLIC_SCHOLARBUDDY_BRIDGE_PORT/);
  assert.match(clientSource, /\/pair\/exchange/);
  assert.match(source, /Configure this Mac/);
  assert.match(source, /bridge-pair/);
  assert.match(source, /Pairing code/);
  assert.match(source, /task\.date === today/);
  // Capture must reach Obsidian, must be reachable from any module, and must not
  // lose typed text while the Bridge is unavailable.
  assert.match(source, /scholarbuddy-journal-draft-v1/);
  assert.match(source, /scholarbuddy-idea-draft-v1/);
  assert.match(source, /scholarbuddy-capture-focus/);
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
  assert.match(source, /scholarbuddy-ai-provider/);
  assert.match(source, /manuscriptId/);
  assert.match(source, /projectId/);
  assert.match(source, /titleLead: "One paper, "/);
  assert.match(source, /<em>\{t\.paper\.titleEm\}<\/em>/);
  assert.match(source, /scholarbuddy-focus-en-v2/);
  assert.match(source, /Focus session length/);
  assert.match(source, /scholarbuddy-focus-completed/);
  assert.match(source, /Set as Primary/);
  assert.doesNotMatch(source, /NEXT OUTPUT · 50 MIN/);
  assert.match(source, /externalId: block\.id/);
  assert.match(source, /scholarbuddy-calendar-refresh/);
  assert.match(source, /focus-wave \$\{running \? "active" : ""\}/);
  assert.match(source, /seconds < 21600/);
  assert.match(source, /scholarbuddy-focus-celebration-v2/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /status: "seen"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /FocusCelebration/);
  assert.match(source, /setTimeout\(finishCelebration, 8000\)/);
  assert.match(source, /scholarbuddy-paper-celebrations-v1/);
  assert.match(source, /热烈祝贺/);
  assert.match(source, /Herzlichen Glückwunsch/);
  assert.match(source, /saved\.stage === "Accepted" \|\| saved\.stage === "Published"/);
  assert.match(source, /title: "Focus and milestones"/);
  assert.match(source, /Calendar sync pending/);
  // Sessions reach Calendar only after the researcher names one, and only that one.
  assert.match(source, /if \(calendarRef\.current\) setPending/);
  assert.match(source, /const calendar = calendarRef\.current;\s+if \(!calendar\) break;/);
  assert.match(source, /window\.addEventListener\("storage", stored\)/);
  assert.match(source, /scholarbuddy-focus-calendar/);
  assert.match(source, /<option value="">\{t\.focusCalendar\.off\}<\/option>/);
  // Tasks an AI plan adds in one tick must not share an id.
  assert.match(source, /id: nextTaskId\(stored\)/);
  assert.match(source, /id: nextTaskId\(items\)/);
  assert.doesNotMatch(source, /id: Date\.now\(\)/);
  // Esc and the backdrop ask before discarding unsaved work.
  assert.match(
    source,
    /if \(canDismiss\(\)\) closeWithTransition\(onClose, event\.currentTarget\)/,
  );
  assert.match(
    source,
    /top === "editor" && unsaved\.editor && !confirmDiscard\(tRef\.current, "record"\)/,
  );
  assert.match(source, /Disconnect this browser/);
  assert.match(source, /could not be loaded/);
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
  assert.match(source, /<small>\{calendarDisplayName\(event\.calendar, locale\)\}<\/small>/);
  assert.match(source, /Confirm deletion of \$\{title\}/);
  assert.match(source, /t\.calendar\.confirmDelete\(event\.title\)/);
  assert.match(source, /\[\s*6,\s*10,\s*16,\s*23,\s*31,\s*19,\s*28,\s*39/);
  assert.match(source, /aria-label=\{\s*running\s*\?\s*t\.focus\.pause\b/);
  assert.match(source, /pause: "Pause focus session"/);
  assert.match(source, /aria-label=\{t\.focus\.reset\}/);
  assert.match(source, /reset: "Reset focus timer"/);
  assert.match(clientSource, /bridgeHealthFetch/);
  assert.match(source, /Passage Library/);
  assert.match(source, /title: "Passage library"/);
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
  assert.match(clientSource, /scholarbuddy-bridge-url/);
  assert.match(source, /bridgeUnreachable: "Bridge unreachable"/);
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
