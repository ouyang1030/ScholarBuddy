import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addSubmissionEvent, authorize, detectSubmissionStatus, handle, invalidCitations, parseRecord, saveRecord, submissionEmailCandidate, syncSubmissionEmails } from "../bridge/server.mjs";

const allowedOrigin = "https://workbench.example";
const bridgeToken = "test-token-with-at-least-thirty-two-characters";

function config(vault) {
  return { WORKBUDDY_ORIGINS: allowedOrigin, OBSIDIAN_VAULT_PATH: vault, _bridgeToken: bridgeToken };
}

function request(pathname, options = {}) {
  return new Request(`http://127.0.0.1:32145${pathname}`, {
    ...options,
    headers: { Origin: allowedOrigin, Authorization: `Bearer ${bridgeToken}`, ...(options.headers || {}) },
  });
}

test("bridge rejects hostile origins and missing pairing tokens before routing", () => {
  const settings = config("/tmp/unused");
  assert.deepEqual(authorize(new Request("http://127.0.0.1/health", { headers: { Origin: "https://attacker.example", Authorization: `Bearer ${bridgeToken}` } }), settings), { ok: false, status: 403, origin: "", code: "origin_denied" });
  assert.equal(authorize(new Request("http://127.0.0.1/health", { headers: { Origin: allowedOrigin } }), settings).status, 401);
  assert.equal(authorize(new Request("http://127.0.0.1/health", { headers: { Origin: allowedOrigin, Authorization: `Bearer ${bridgeToken}` } }), settings).ok, true);
});

test("write routes reject simple text/plain requests", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-content-type-"));
  try {
    await assert.rejects(handle(request("/obsidian/note", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ title: "attack", content: "must not be written" }) }), config(vault)), (error) => error.status === 415);
    await assert.rejects(readFile(path.join(vault, "WorkBuddy", "AI Outputs", "attack.md")));
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test("AI workflow stops before model execution when a selected source fails", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-retrieval-"));
  try {
    const settings = { ...config(vault), ZOTERO_LOCAL_URL: "http://127.0.0.1:1", DEEPSEEK_API_KEY: "must-not-be-used" };
    const response = await handle(request("/ai/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "deepseek", input: "ACL injury", sources: { zotero: true, obsidian: false, kbase: false } }) }), settings);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "retrieval_failed");
    assert.equal(body.retrieval.zotero.status, "error");
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test("AI notes never overwrite a prior save", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-ai-notes-"));
  try {
    const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "result explain", content: "evidence-backed draft" }) };
    const first = await (await handle(request("/obsidian/note", options), config(vault))).json();
    const second = await (await handle(request("/obsidian/note", options), config(vault))).json();
    assert.notEqual(first.path, second.path);
    assert.equal(await readFile(path.join(vault, first.path), "utf8"), "evidence-backed draft\n");
    assert.equal(await readFile(path.join(vault, second.path), "utf8"), "evidence-backed draft\n");
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test("Kbase saves atomically, detects stale updates, and archives history", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-history-"));
  try {
    const first = await saveRecord(config(vault), "projects", { id: "PRJ-test", title: "First title", description: "v1" });
    const second = await saveRecord(config(vault), "projects", { ...first, title: "Second title", description: "v2" });
    await assert.rejects(saveRecord(config(vault), "projects", { ...first, title: "Stale title" }), (error) => error.status === 409);
    const current = parseRecord(await readFile(path.join(vault, "WorkBuddy", "projects", "PRJ-test.md"), "utf8"), "PRJ-test");
    assert.equal(current.title, "Second title");
    assert.equal(current.description, "v2");
    assert.equal(current.updatedAt, second.updatedAt);
    const history = await readdir(path.join(vault, "WorkBuddy", ".history", "projects", "PRJ-test"));
    assert.equal(history.length, 1);
    assert.match(await readFile(path.join(vault, "WorkBuddy", ".history", "projects", "PRJ-test", history[0]), "utf8"), /First title/);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test("citation validation identifies references missing from the evidence manifest", () => {
  const manifest = { zotero: [{ id: "Z1" }], obsidian: [{ id: "O1" }] };
  assert.deepEqual(invalidCitations("Supported [Z1] [O1], invented [Z9] and [O7].", manifest), ["Z9", "O7"]);
});

test("calendar adapter uses interval overlap and preserves notes unless supplied", async () => {
  const source = await readFile(new URL("../bridge/calendar.jxa", import.meta.url), "utf8");
  assert.match(source, /endDate > start && startDate < end/);
  assert.match(source, /payload\.notes !== undefined/);
  assert.doesNotMatch(source, /startDate >= start && startDate < end/);
});

test("submission status detection normalizes publisher wording", () => {
  assert.equal(detectSubmissionStatus("The required reviews are complete"), "Reviews Complete");
  assert.equal(detectSubmissionStatus("Your manuscript is now under review"), "Under Review");
  assert.equal(detectSubmissionStatus("We invite you to revise your manuscript"), "Revision Required");
  assert.equal(detectSubmissionStatus("No workflow language here"), "");
});

test("submission email matching requires manuscript context and reports confidence", () => {
  const attempts = [{ id: "SUB-one", manuscriptId: "MS-one", manuscriptTitle: "ACL workload in elite football", submissionId: "JSS-2026-0142", journal: "Journal of Sports Science" }];
  const candidate = submissionEmailCandidate({ id: "mail-1", subject: "JSS-2026-0142 is now Under Review", sender: "editor@example.com", receivedAt: "2026-08-01T10:00:00Z" }, attempts);
  assert.equal(candidate.attemptId, "SUB-one");
  assert.equal(candidate.status, "Under Review");
  assert.equal(candidate.confidence, "high");
});

test("submission events append history and advance the attempt", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-submission-"));
  try {
    await saveRecord(config(vault), "manuscripts", { id: "MS-one", title: "Paper one" });
    await saveRecord(config(vault), "submission-attempts", { id: "SUB-one", title: "Paper one at Journal A", manuscriptId: "MS-one", manuscriptTitle: "Paper one", journal: "Journal A", submissionId: "JA-101", status: "Submitted", submittedAt: "2026-07-01T00:00:00.000Z" });
    const event = await addSubmissionEvent(config(vault), { attemptId: "SUB-one", status: "Under Review", eventDate: "2026-07-10T00:00:00.000Z", rawStatus: "Reviewers assigned" });
    assert.equal(event.status, "Under Review");
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state["submission-events"].length, 1);
    assert.equal(state["submission-attempts"][0].status, "Under Review");
    assert.equal(state["submission-attempts"][0].stageStartedAt, "2026-07-10T00:00:00.000Z");
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test("high-confidence email sync is idempotent", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-email-sync-"));
  try {
    await saveRecord(config(vault), "submission-attempts", { id: "SUB-one", title: "Paper one", manuscriptId: "MS-one", manuscriptTitle: "Paper one", journal: "Journal A", submissionId: "JA-101", status: "Submitted" });
    const emails = [{ id: "mail-101", subject: "JA-101 is now under review", sender: "editor@journal.test", receivedAt: "2026-08-01T10:00:00Z" }];
    const first = await syncSubmissionEmails(config(vault), emails);
    const second = await syncSubmissionEmails(config(vault), emails);
    assert.equal(first.updated.length, 1);
    assert.equal(second.updated.length, 0);
  } finally { await rm(vault, { recursive: true, force: true }); }
});
