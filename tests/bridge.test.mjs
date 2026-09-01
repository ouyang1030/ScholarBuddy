import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addSubmissionEvent,
  authorize,
  calendarContext,
  deleteRecord,
  detectPassageSection,
  detectSubmissionStatus,
  evidenceManifest,
  fulltextIndex,
  handle,
  invalidReferenceIds,
  issuePairingCode,
  itemKeywords,
  modelConfig,
  modelRequest,
  modelResponse,
  normalizeZoteroPassage,
  outlineFromFulltext,
  parseRecord,
  relevantFulltextExcerpt,
  saveRecord,
  searchObsidian,
  streamDelta,
  submissionEmailCandidate,
  syncSubmissionEmails,
  verifySubmissionAttempt,
  zoteroItemsByKey,
} from "../bridge/server.mjs";
import { compareRecords } from "../shared/records.mjs";
import { readEventStream } from "../shared/sse.mjs";
import {
  CLOSED_RECORD_STATUSES,
  GENERIC_RECORD_STATUSES,
  RECORD_STATUS_OPTIONS,
} from "../shared/constants.mjs";
import { parseActions, systemPrompt } from "../bridge/prompts.mjs";
import { topicTerms } from "../bridge/search-terms.mjs";
import { parseEnv, updateLocalConfig } from "../bridge/local-settings.mjs";
import { AI_PROVIDER_DEFINITIONS } from "../shared/constants.mjs";
import {
  manuscriptSectionEntries,
  manuscriptSectionText,
  replaceManuscriptSection,
  sectionBody,
} from "../shared/manuscript-text.mjs";
import { WORKFLOW_CONTRACTS, workflowContract } from "../shared/workflows.mjs";
import { zoteroPassageUrl } from "../shared/zotero.mjs";

const allowedOrigin = "https://workbench.example";
const bridgeToken = "test-token-with-at-least-thirty-two-characters";

function config(vault) {
  return {
    WORKBUDDY_ORIGINS: allowedOrigin,
    OBSIDIAN_VAULT_PATH: vault,
    _bridgeToken: bridgeToken,
    // The request window and the token budget are process-wide, so a suite with
    // more AI tests than the production ceiling would fail whichever ones
    // happened to run last. The limiter is tested below with its own numbers.
    WORKBUDDY_AI_REQUESTS_PER_10_MIN: "1000",
    WORKBUDDY_AI_DAILY_TOKENS: "10000000",
  };
}

function request(pathname, options = {}) {
  return new Request(`http://127.0.0.1:32145${pathname}`, {
    ...options,
    headers: {
      Origin: allowedOrigin,
      Authorization: `Bearer ${bridgeToken}`,
      ...(options.headers || {}),
    },
  });
}

test("bridge rejects hostile origins and missing pairing tokens before routing", () => {
  const settings = config("/tmp/unused");
  assert.deepEqual(
    authorize(
      new Request("http://127.0.0.1/health", {
        headers: { Origin: "https://attacker.example", Authorization: `Bearer ${bridgeToken}` },
      }),
      settings,
    ),
    { ok: false, status: 403, origin: "", code: "origin_denied" },
  );
  assert.equal(
    authorize(
      new Request("http://127.0.0.1/health", { headers: { Origin: allowedOrigin } }),
      settings,
    ).status,
    401,
  );
  assert.equal(
    authorize(
      new Request("http://127.0.0.1/health", {
        headers: { Origin: allowedOrigin, Authorization: `Bearer ${bridgeToken}` },
      }),
      settings,
    ).ok,
    true,
  );
  assert.equal(
    authorize(
      new Request("http://127.0.0.1/health", {
        headers: { Origin: allowedOrigin, Authorization: `Bearer ${bridgeToken}` },
      }),
      { ...settings, WORKBUDDY_ORIGINS: "*" },
    ).status,
    403,
  );
  assert.equal(
    authorize(
      new Request("http://127.0.0.1/health", {
        headers: { Origin: allowedOrigin, Authorization: `Bearer ${bridgeToken}` },
      }),
      { ...settings, WORKBUDDY_ORIGINS: `${allowedOrigin}/path` },
    ).status,
    403,
  );
});

test("pairing exchanges one-time codes without exposing the permanent token", async () => {
  const settings = config("/tmp/unused");
  const page = await handle(new Request("http://127.0.0.1:32145/pair"), settings);
  const pageHtml = await page.text();
  assert.equal(page.status, 200);
  assert.doesNotMatch(pageHtml, new RegExp(bridgeToken));
  assert.match(pageHtml, /expires in five minutes/i);

  const code = issuePairingCode(bridgeToken);
  const exchange = () =>
    new Request("http://127.0.0.1:32145/pair/exchange", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  const first = await handle(exchange(), settings);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { token: bridgeToken });

  const replay = await handle(exchange(), settings);
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).code, "pairing_code_invalid");

  const hostile = await handle(
    new Request("http://127.0.0.1:32145/pair/exchange", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ code: issuePairingCode(bridgeToken) }),
    }),
    settings,
  );
  assert.equal(hostile.status, 403);
});

test("local setup requires direct navigation and a short-lived same-origin session", async () => {
  const settings = config("/tmp/unused");
  const blocked = await handle(
    new Request("http://127.0.0.1:32145/setup", {
      headers: { Origin: "https://attacker.example" },
    }),
    settings,
  );
  assert.equal(blocked.status, 403);

  const page = await handle(
    new Request("http://127.0.0.1:32145/setup?return=https%3A%2F%2Fworkbench.example"),
    settings,
  );
  const source = await page.text();
  const session = source.match(/"session":"([A-Za-z0-9_-]+)"/)?.[1];
  assert.equal(page.status, 200);
  assert.ok(session);
  assert.doesNotMatch(source, new RegExp(bridgeToken));
  assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);

  const state = await handle(
    new Request("http://127.0.0.1:32145/setup/state", {
      headers: { Origin: "http://127.0.0.1:32145", "X-ScholarBuddy-Setup": session },
    }),
    settings,
  );
  assert.equal(state.status, 200);
  const hostile = await handle(
    new Request("http://127.0.0.1:32145/setup/state", {
      headers: { Origin: "https://attacker.example", "X-ScholarBuddy-Setup": session },
    }),
    settings,
  );
  assert.equal(hostile.status, 401);
});

test("local settings updates preserve comments and protect the file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scholarbuddy-settings-"));
  const file = path.join(directory, ".env.local");
  try {
    await writeFile(
      file,
      "# local settings\nOBSIDIAN_VAULT_PATH=/old/path\nOPENAI_MODEL=old-model\n",
    );
    await updateLocalConfig(file, {
      OBSIDIAN_VAULT_PATH: "/Users/Research Vault",
      OPENAI_MODEL: "new-model",
    });
    const source = await readFile(file, "utf8");
    assert.match(source, /^# local settings/m);
    assert.deepEqual(parseEnv(source), {
      OBSIDIAN_VAULT_PATH: "/Users/Research Vault",
      OPENAI_MODEL: "new-model",
    });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("write routes reject simple text/plain requests", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-content-type-"));
  try {
    await assert.rejects(
      handle(
        request("/obsidian/note", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ title: "attack", content: "must not be written" }),
        }),
        config(vault),
      ),
      (error) => error.status === 415,
    );
    await assert.rejects(readFile(path.join(vault, "ScholarBuddy", "AI Outputs", "attack.md")));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("AI workflow stops before model execution when a selected source fails", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-retrieval-"));
  try {
    const settings = {
      ...config(vault),
      ZOTERO_LOCAL_URL: "http://127.0.0.1:1",
      DEEPSEEK_API_KEY: "must-not-be-used",
    };
    const response = await handle(
      request("/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          command: "@ask-knowledge",
          input: "ACL injury",
          sources: { zotero: true, obsidian: false, kbase: false },
        }),
      }),
      settings,
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "retrieval_failed");
    assert.equal(body.retrieval.zotero.status, "error");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("AI workflow rejects an unknown provider before retrieving local sources", async () => {
  const responsePromise = handle(
    request("/ai/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "typo-provider",
        command: "@ask-knowledge",
        input: "ACL injury",
        sources: { zotero: true, obsidian: true, kbase: true },
      }),
    }),
    config("/tmp/unused"),
  );
  await assert.rejects(
    responsePromise,
    (error) => error.status === 422 && error.code === "provider_invalid",
  );
});

test("the daily token budget refuses a run before it reaches a provider", async () => {
  const response = await handle(
    request("/ai/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        command: "@ask-knowledge",
        input: "ACL injury",
        sources: { zotero: false, obsidian: false, kbase: false },
      }),
    }),
    {
      ...config("/tmp/unused"),
      DEEPSEEK_API_KEY: "must-not-be-used",
      // Below one reservation, so the budget is spent whatever else has run.
      WORKBUDDY_AI_DAILY_TOKENS: "1000",
    },
  );
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "ai_limit");
});

test("health is lightweight and detailed integration checks use status", async () => {
  const response = await handle(request("/health"), config("/path/that/does/not/exist"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { bridge: true, paired: true });
});

test("AI providers use their native request and response formats", () => {
  const providers = {
    openai: {
      key: "OPENAI_API_KEY",
      adapter: "responses",
      url: "https://api.openai.com/v1/responses",
      model: "gpt-5.6-terra",
    },
    claude: {
      key: "ANTHROPIC_API_KEY",
      adapter: "anthropic-messages",
      url: "https://api.anthropic.com/v1/messages",
      model: "claude-sonnet-5",
    },
    grok: {
      key: "XAI_API_KEY",
      adapter: "responses",
      url: "https://api.x.ai/v1/responses",
      model: "grok-4.6",
    },
    gemini: {
      key: "GEMINI_API_KEY",
      adapter: "gemini-generate-content",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
      model: "gemini-3.7-flash",
    },
  };
  for (const [provider, expected] of Object.entries(providers)) {
    const target = modelConfig({ [expected.key]: `${provider}-secret` }, provider);
    const request = modelRequest(target, "system rule", "user task", 777);
    const payload = JSON.parse(request.init.body);
    assert.equal(target.adapter, expected.adapter);
    assert.equal(target.model, expected.model);
    assert.equal(request.url, expected.url);
    assert.equal(payload.model || target.model, expected.model);
    assert.equal(request.init.method, "POST");
  }

  const openai = modelConfig({ OPENAI_API_KEY: "secret" }, "openai");
  const openaiRequest = modelRequest(openai, "system rule", "user task", 777);
  assert.equal(openaiRequest.init.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(openaiRequest.init.body), {
    model: "gpt-5.6-terra",
    instructions: "system rule",
    input: "user task",
    max_output_tokens: 777,
  });
  assert.deepEqual(
    modelResponse(openai, {
      output: [{ content: [{ type: "output_text", text: "OpenAI result" }] }],
      usage: { total_tokens: 12 },
    }),
    { output: "OpenAI result", usage: { total_tokens: 12 } },
  );

  const claude = modelConfig({ ANTHROPIC_API_KEY: "secret" }, "claude");
  const claudeRequest = modelRequest(claude, "system rule", "user task", 777);
  assert.equal(claudeRequest.init.headers["x-api-key"], "secret");
  assert.equal(claudeRequest.init.headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(JSON.parse(claudeRequest.init.body).messages, [
    { role: "user", content: "user task" },
  ]);
  assert.deepEqual(
    modelResponse(claude, {
      content: [{ type: "text", text: "Claude result" }],
      usage: { input_tokens: 4, output_tokens: 5 },
    }),
    { output: "Claude result", usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 } },
  );

  const grok = modelConfig({ XAI_API_KEY: "secret" }, "grok");
  assert.equal(
    modelRequest(grok, "system rule", "user task", 777).init.headers.Authorization,
    "Bearer secret",
  );
  assert.equal(
    modelResponse(grok, { output: [{ content: [{ type: "output_text", text: "Grok result" }] }] })
      .output,
    "Grok result",
  );

  const gemini = modelConfig({ GEMINI_API_KEY: "secret" }, "gemini");
  const geminiRequest = modelRequest(gemini, "system rule", "user task", 777);
  assert.equal(geminiRequest.init.headers["x-goog-api-key"], "secret");
  assert.deepEqual(JSON.parse(geminiRequest.init.body).systemInstruction, {
    parts: [{ text: "system rule" }],
  });
  assert.deepEqual(
    modelResponse(gemini, {
      candidates: [{ content: { parts: [{ text: "Gemini result" }] } }],
      usageMetadata: { totalTokenCount: 11 },
    }),
    { output: "Gemini result", usage: { totalTokenCount: 11, total_tokens: 11 } },
  );
});

test("AI notes never overwrite a prior save", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-ai-notes-"));
  try {
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "result explain", content: "evidence-backed draft" }),
    };
    const first = await (await handle(request("/obsidian/note", options), config(vault))).json();
    const second = await (await handle(request("/obsidian/note", options), config(vault))).json();
    assert.notEqual(first.path, second.path);
    assert.equal(await readFile(path.join(vault, first.path), "utf8"), "evidence-backed draft\n");
    assert.equal(await readFile(path.join(vault, second.path), "utf8"), "evidence-backed draft\n");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("Obsidian records save atomically, detect stale updates, and archive history", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-history-"));
  try {
    const first = await saveRecord(config(vault), "projects", {
      id: "PRJ-test",
      title: "First title",
      description: "v1",
    });
    const second = await saveRecord(config(vault), "projects", {
      ...first,
      title: "Second title",
      description: "v2",
    });
    await assert.rejects(
      saveRecord(config(vault), "projects", { id: first.id, title: "Missing version" }),
      (error) => error.status === 428 && error.code === "version_required",
    );
    await assert.rejects(
      saveRecord(config(vault), "projects", { ...first, title: "Stale title" }),
      (error) => error.status === 409,
    );
    const current = parseRecord(
      await readFile(path.join(vault, "ScholarBuddy", "projects", "PRJ-test.md"), "utf8"),
      "PRJ-test",
    );
    assert.equal(current.title, "Second title");
    assert.equal(current.description, "v2");
    assert.equal(current.updatedAt, second.updatedAt);
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    const history = await readdir(
      path.join(vault, "ScholarBuddy", ".history", "projects", "PRJ-test"),
    );
    assert.equal(history.length, 1);
    assert.match(
      await readFile(
        path.join(vault, "ScholarBuddy", ".history", "projects", "PRJ-test", history[0]),
        "utf8",
      ),
      /First title/,
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("record mutations serialize same-version writers instead of losing an update", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-record-race-"));
  try {
    const first = await saveRecord(config(vault), "projects", {
      id: "PRJ-race",
      title: "Initial",
    });
    const results = await Promise.allSettled([
      saveRecord(config(vault), "projects", { ...first, title: "Writer A" }),
      saveRecord(config(vault), "projects", { ...first, title: "Writer B" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (result) => result.status === "rejected" && result.reason?.code === "version_conflict",
      ).length,
      1,
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("permanent deletion removes both the live record and every history version", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-permanent-delete-"));
  try {
    const first = await saveRecord(config(vault), "projects", {
      id: "PRJ-delete",
      title: "First",
    });
    const second = await saveRecord(config(vault), "projects", { ...first, title: "Second" });
    await assert.rejects(
      deleteRecord(config(vault), "projects", second.id, first.version),
      (error) => error.status === 409 && error.code === "version_conflict",
    );
    const result = await deleteRecord(config(vault), "projects", second.id, second.version);
    assert.deepEqual(result, { deleted: true, id: second.id, historyPurged: true });
    await assert.rejects(
      stat(path.join(vault, "ScholarBuddy", "projects", "PRJ-delete.md")),
      (error) => error.code === "ENOENT",
    );
    await assert.rejects(
      stat(path.join(vault, "ScholarBuddy", ".history", "projects", "PRJ-delete")),
      (error) => error.code === "ENOENT",
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("the record boundary rejects malformed stored types and drops legacy executable URLs", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-record-schema-"));
  const folder = path.join(vault, "ScholarBuddy", "passages");
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "PASS-safe.md"),
      '---\ntitle: "Safe passage"\ncollection: "passages"\nattachmentKey: "PDF1"\nzoteroUrl: "javascript:alert(1)"\ncustomPluginData: {"color":"blue"}\n---\n',
    );
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state.passages[0].zoteroUrl, undefined);
    assert.deepEqual(state.passages[0].customPluginData, { color: "blue" });
    const updated = await saveRecord(config(vault), "passages", {
      ...state.passages[0],
      title: "Updated passage",
    });
    assert.deepEqual(updated.customPluginData, { color: "blue" });
    await writeFile(
      path.join(folder, "PASS-bad.md"),
      '---\ntitle: {"unexpected":true}\ncollection: "passages"\n---\n',
    );
    await assert.rejects(
      handle(request("/workbench/state"), config(vault)),
      (error) => error.status === 422 && /title must be a string/.test(error.message),
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("paper issues keep the problem, plan, and response in one record", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-paper-issue-"));
  try {
    const issue = await saveRecord(config(vault), "reviews", {
      title: "Clarify the sampling decision",
      description: "Reviewer 2 asks why this sample was retained.",
      issueKind: "Feedback",
      actionPlan: "Add the exclusion rationale to Methods.",
      resolution: "Methods now names the criterion and affected cases.",
      status: "Resolved",
    });
    assert.equal(issue.issueKind, "Feedback");
    assert.equal(issue.actionPlan, "Add the exclusion rationale to Methods.");
    assert.equal(issue.resolution, "Methods now names the criterion and affected cases.");
    const markdown = await readFile(
      path.join(vault, "ScholarBuddy", "reviews", `${issue.id}.md`),
      "utf8",
    );
    assert.match(markdown, /issueKind: "Feedback"/);
    assert.match(markdown, /actionPlan: "Add the exclusion rationale to Methods\."/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("Obsidian records validate common fields and keep only one active project", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-record-validation-"));
  try {
    const first = await saveRecord(config(vault), "projects", {
      id: "PRJ-one",
      title: "First",
      active: true,
      progress: 50,
    });
    await assert.rejects(
      saveRecord(config(vault), "projects", { ...first, progress: 101 }),
      (error) => error.status === 422,
    );
    await saveRecord(config(vault), "projects", { id: "PRJ-two", title: "Second", active: true });
    await Promise.all([
      saveRecord(config(vault), "projects", { id: "PRJ-three", title: "Third", active: true }),
      saveRecord(config(vault), "projects", { id: "PRJ-four", title: "Fourth", active: true }),
    ]);
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state.projects.filter((project) => project.active).length, 1);
    assert.equal(state.projects.find((project) => project.active).id, "PRJ-four");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("research log entries and ideas are ordinary records with their own dates and links", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-capture-"));
  try {
    const entry = await saveRecord(config(vault), "journal", {
      title: "Re-ran the GAM",
      description: "The age term is no longer significant once team is included.",
      entryDate: "2026-08-18",
    });
    assert.match(entry.id, /^LOG-/);
    // The body is the entry, so the vault file stays a readable note rather than
    // a record whose content lives in the front matter.
    const file = await readFile(
      path.join(vault, "ScholarBuddy", "journal", `${entry.id}.md`),
      "utf8",
    );
    assert.match(file, /The age term is no longer significant/);
    assert.match(file, /entryDate: "2026-08-18"/);
    await assert.rejects(
      saveRecord(config(vault), "journal", { title: "Bad date", entryDate: "not-a-date" }),
      (error) => error.status === 422,
    );
    const idea = await saveRecord(config(vault), "ideas", { title: "HRV as a mediator" });
    assert.match(idea.id, /^IDEA-/);
    const promoted = await saveRecord(config(vault), "ideas", {
      ...idea,
      status: "Promoted",
      promotedTo: "RQ-1234",
    });
    assert.equal(promoted.promotedTo, "RQ-1234");
    await assert.rejects(
      saveRecord(config(vault), "ideas", { ...promoted, promotedTo: "../escape" }),
      (error) => error.status === 422,
    );
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state.journal.length, 1);
    assert.equal(state.ideas.length, 1);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("citation validation identifies references missing from the evidence manifest", () => {
  const manifest = { zotero: [{ id: "Z1" }], obsidian: [{ id: "O1" }] };
  assert.deepEqual(invalidReferenceIds("Supported [Z1] [O1], invented [Z9] and [O7].", manifest), [
    "Z9",
    "O7",
  ]);
});

test("calendar context carries the time and the title, and nothing else", () => {
  // The bridge reports UTC, so the fixtures are built from local wall-clock
  // times: the assertions then hold in any zone the workbench runs in.
  const events = [
    {
      id: "B",
      title: "Cafe Cursor Vienna",
      start: new Date(2026, 7, 29, 9, 0).toISOString(),
      end: new Date(2026, 7, 29, 10, 30).toISOString(),
      allDay: false,
      location: "Vienna, Stephansplatz 1",
      notes: "Private note that must not leave the machine",
      calendar: "工作",
    },
    {
      id: "A",
      title: "Data collection at the club",
      start: new Date(2026, 7, 27).toISOString(),
      end: new Date(2026, 7, 28).toISOString(),
      allDay: true,
    },
  ];
  const context = calendarContext(events);
  assert.deepEqual(context, [
    { when: "2026-08-27 (all day)", title: "Data collection at the club" },
    { when: "2026-08-29 09:00–10:30", title: "Cafe Cursor Vienna" },
  ]);
  const serialized = JSON.stringify(context);
  for (const leaked of ["Stephansplatz", "Private note", "工作", "B"])
    assert.doesNotMatch(serialized, new RegExp(leaked), `${leaked} reached the prompt`);
  assert.deepEqual(calendarContext(undefined), []);
  // An event the bridge could not date is dropped rather than sent undated.
  assert.deepEqual(calendarContext([{ title: "Broken", start: "not a date" }]), []);
  assert.equal(
    calendarContext(
      Array.from({ length: 40 }, (_, index) => ({
        title: "x",
        start: new Date(2026, 7, 27, 8, index).toISOString(),
        allDay: true,
      })),
    ).length,
    20,
  );
});

test("Zotero tags become subject keywords without the workflow markers", () => {
  assert.deepEqual(
    itemKeywords([{ tag: "/done" }, { tag: "⭐⭐⭐⭐" }, { tag: "⛔ No DOI found" }]),
    [],
  );
  // A bilingual tag repeats the English term after a run of spaces, and the
  // term itself is usually filed separately as well.
  assert.deepEqual(
    itemKeywords([
      { tag: "analytics" },
      { tag: "analytics\u00a0\u00a0分析/数据分析" },
      { tag: "Analytics" },
      { tag: "Hawk-Eye" },
    ]),
    ["analytics", "Hawk-Eye"],
  );
  // \w is ASCII-only in JavaScript, so a keyword in any other script has to be
  // matched by a Unicode property escape or it is dropped as a symbol.
  assert.deepEqual(itemKeywords([{ tag: "Übertraining" }, { tag: "足球" }, { tag: "Éire" }]), [
    "Übertraining",
    "足球",
    "Éire",
  ]);
  assert.equal(itemKeywords(Array.from({ length: 20 }, (_, i) => `term${i}`)).length, 8);
  assert.deepEqual(itemKeywords(undefined), []);
});

test("only exact excerpts receive citable evidence IDs", () => {
  const manifest = evidenceManifest({
    query: "sprint effect",
    retrievedAt: "2026-08-24T10:00:00.000Z",
    zotero: [
      {
        key: "WITH-TEXT",
        title: "Measured result",
        creators: ["A. Author"],
        year: "2025",
        doi: "",
        url: "",
        excerpt: "Sprint counts increased by twelve percent.",
      },
      {
        key: "METADATA",
        title: "Metadata only",
        creators: ["B. Author"],
        year: "2024",
        doi: "",
        url: "",
        excerpt: "",
      },
    ],
    obsidian: [{ title: "Analysis", path: "Analysis.md", modified: "", snippet: "Model output." }],
    passages: [{ key: "P", sourceTitle: "Paper", year: "2025", pageLabel: "4", quote: "Quote." }],
  });
  assert.deepEqual(
    manifest.zotero.map((item) => item.id),
    ["Z1"],
  );
  assert.deepEqual(
    manifest.bibliography.map((item) => item.key),
    ["METADATA"],
  );
  assert.equal("contentHash" in manifest.zotero[0], false);
  assert.deepEqual(invalidReferenceIds("Supported [Z1], metadata invented as [Z2].", manifest), [
    "Z2",
  ]);
});

test("Zotero open links are derived from inert keys under a fixed protocol", () => {
  const url = zoteroPassageUrl({
    attachmentKey: "javascript:alert(1)",
    annotationKey: "ANN 1",
    pageLabel: "12",
  });
  assert.match(url, /^zotero:\/\/open-pdf\/library\/items\//);
  assert.doesNotMatch(url, /^javascript:/i);
  assert.match(url, /annotation=ANN\+1/);
});

test("the example Gemini configuration matches the shared provider defaults", async () => {
  const example = parseEnv(
    await readFile(new URL("../.env.local.example", import.meta.url), "utf8"),
  );
  const gemini = AI_PROVIDER_DEFINITIONS.find((provider) => provider.id === "gemini");
  assert.equal(example.GEMINI_MODEL, gemini.defaultModel);
  assert.equal(example.GEMINI_BASE_URL, gemini.defaultBase);
});

test("a note's prose never files it, and an unlocatable annotation never throws", () => {
  const pages = ["Introduction\nOpening prose.", "Methods\nParticipants were recruited here."];
  const fulltext = fulltextIndex(pages);
  const annotation = (extra) => ({
    data: {
      key: "ANN1",
      parentItem: "PDF1",
      annotationText: "A useful result.",
      annotationSortIndex: "00001|000018|00292",
      ...extra,
    },
  });
  // The comment mentions results; the highlight still sits under Methods.
  const commented = normalizeZoteroPassage(
    annotation({ annotationComment: "compare to our results" }),
    null,
    null,
    fulltext,
  );
  assert.equal(commented.section, "Methods");
  assert.equal(commented.sectionSource, "pdf");
  // A tag that is the section name, however, is a filing decision.
  const filed = normalizeZoteroPassage(
    annotation({ tags: [{ tag: "discussion" }] }),
    null,
    null,
    fulltext,
  );
  assert.equal(filed.section, "Discussion");
  assert.equal(filed.sectionSource, "tag");
  // A tag that merely contains the word is not.
  const mentioned = normalizeZoteroPassage(
    annotation({ tags: [{ tag: "results of the pilot" }] }),
    null,
    null,
    fulltext,
  );
  assert.equal(mentioned.sectionSource, "pdf");
  // A sort index that names no page must not reach the page array.
  assert.equal(detectPassageSection(fulltext, Number.NaN, 5), null);
  assert.equal(detectPassageSection(fulltext, 0, Number.NaN), null);
});

test("Zotero annotations become source-aware passages without changing the highlight", () => {
  const passage = normalizeZoteroPassage(
    {
      data: {
        key: "ANN1",
        parentItem: "PDF1",
        annotationText: "A useful result.",
        annotationComment: "Use in discussion",
        annotationPageLabel: "12",
        annotationColor: "#ffd400",
        tags: [{ tag: "validity" }],
        dateModified: "2026-08-15T10:00:00Z",
      },
    },
    { data: { key: "PDF1", parentItem: "ITEM1", title: "Full text" } },
    {
      data: {
        key: "ITEM1",
        title: "Measurement validity",
        creators: [{ firstName: "Ada", lastName: "Lovelace" }],
        date: "2025",
        extra: "Citation Key: lovelace2025",
      },
    },
  );
  assert.equal(passage.text, "A useful result.");
  assert.equal(passage.sourceTitle, "Measurement validity");
  assert.equal(passage.citationKey, "lovelace2025");
  assert.deepEqual(passage.citationAuthors, ["Lovelace"]);
  assert.deepEqual(passage.tags, ["validity"]);
  assert.match(passage.url, /^zotero:\/\/open-pdf\/library\/items\/PDF1\?/);
});

test("every vocabulary's finished states are recognised as closed work", () => {
  // Attention badges and the model's OPEN COMMITMENTS block both filter on this
  // list. A vocabulary that adds a finished state without naming it here keeps
  // reporting completed work as outstanding.
  for (const finished of ["Done", "Read", "Resolved", "Completed", "Archived"])
    assert.ok(CLOSED_RECORD_STATUSES.includes(finished), `${finished} is not treated as closed`);
  for (const open of ["Planned", "In progress", "Blocked", "Queued", "Reading", "Active"])
    assert.ok(!CLOSED_RECORD_STATUSES.includes(open), `${open} is wrongly treated as closed`);
});

test("a collection's status list opens on its own first state and never repeats one", () => {
  for (const [collection, statuses] of [
    ...Object.entries(RECORD_STATUS_OPTIONS),
    ["generic", GENERIC_RECORD_STATUSES],
  ]) {
    assert.ok(statuses.length, `${collection} has no statuses`);
    assert.equal(new Set(statuses).size, statuses.length, `${collection} repeats a status`);
    assert.equal(typeof statuses[0], "string");
  }
  // The editor defaults a new record to the first entry, so these are the states
  // records actually open in.
  assert.equal(RECORD_STATUS_OPTIONS["reading-queue"][0], "Queued");
  assert.equal(RECORD_STATUS_OPTIONS.operations[0], "Planned");
  assert.equal(RECORD_STATUS_OPTIONS.reviews[0], "Open");
  assert.equal(RECORD_STATUS_OPTIONS["research-debt"][0], "Open");
  assert.equal(GENERIC_RECORD_STATUSES[0], "Active");
});

test("the reading queue puts what is being read on top and what is read at the bottom", () => {
  const queue = [
    { id: "a", title: "Finished paper", status: "Read", updatedAt: "2026-08-26T12:00:00Z" },
    { id: "b", title: "Older queued paper", status: "Queued", updatedAt: "2026-08-20T09:00:00Z" },
    { id: "c", title: "Open paper", status: "Reading", updatedAt: "2026-08-25T09:00:00Z" },
    { id: "d", title: "Just attached", status: "Queued", updatedAt: "2026-08-26T18:00:00Z" },
    // A record saved before the queue had its own states, or one whose status was
    // typed by hand in Obsidian, sits below what is queued and above what is
    // finished — nothing about it says it has been read.
    { id: "e", title: "Legacy paper", status: "Active", updatedAt: "2026-08-26T20:00:00Z" },
    // No status at all is the state a new item opens in.
    { id: "f", title: "Statusless paper", updatedAt: "2026-08-21T09:00:00Z" },
  ];
  assert.deepEqual(
    [...queue].sort((a, b) => compareRecords("reading-queue", a, b)).map((item) => item.id),
    ["c", "d", "f", "b", "e", "a"],
  );
  // Every other collection keeps the plain most-recently-changed-first order.
  assert.deepEqual(
    [...queue].sort((a, b) => compareRecords("manuscripts", a, b)).map((item) => item.id),
    ["e", "d", "a", "c", "f", "b"],
  );
});

test("the full-text outline drops running heads and contents entries", () => {
  const pages = [
    ["Contents", "1 Introduction 1", "2 Related Work 6", "3 Methods 14", "4 Discussion 28"].join(
      "\n",
    ),
    ["CHAPTER 1. INTRODUCTION 2", "1 Introduction", "Some opening prose."].join("\n"),
    ["CHAPTER 1. INTRODUCTION 3", "More prose."].join("\n"),
    ["CHAPTER 1. INTRODUCTION 4", "Still more prose."].join("\n"),
    ["3 Methods", "3.2 Summary of findings", "Results of the model were compared"].join("\n"),
  ];
  const outline = outlineFromFulltext(pages);
  assert.deepEqual(
    outline.map((entry) => [entry.pageIndex, entry.heading, entry.section]),
    [
      [1, "1 Introduction", "Introduction"],
      [4, "3 Methods", "Methods"],
    ],
  );
});

test("a highlight is placed by the heading it sits under, on its page or an earlier one", () => {
  const pages = [
    "Introduction\nOpening prose that runs on.\nMethods\nParticipants were recruited.",
    "Prose continuing the method.\nResults\nThe effect was large.",
  ];
  const index = fulltextIndex(pages);
  const at = (page, text) => {
    const offset = pages[page].indexOf(text);
    return pages[page].slice(0, offset).replace(/\s/g, "").length;
  };
  assert.equal(detectPassageSection(index, 0, at(0, "Opening")).section, "Introduction");
  assert.equal(detectPassageSection(index, 0, at(0, "Participants")).section, "Methods");
  // Nothing on this page opens a section, so the one from the page before holds.
  assert.equal(detectPassageSection(index, 1, at(1, "Prose")).section, "Methods");
  assert.equal(detectPassageSection(index, 1, at(1, "The effect")).section, "Results");
  assert.equal(detectPassageSection(index, 1, -1), null);
  assert.equal(detectPassageSection(null, 0, 0), null);
  // Only the outline survives: a page beyond the document is still rejected
  // without the text ever being kept.
  assert.deepEqual(Object.keys(index).sort(), ["outline", "pageCount"]);
  assert.equal(detectPassageSection(index, 9, 0), null);
});

test("passages report where their section came from and stay usable without a full text", () => {
  const annotation = (extra) => ({
    data: {
      key: "ANN1",
      parentItem: "PDF1",
      annotationText: "A useful result.",
      annotationSortIndex: "00001|000018|00292",
      annotationPosition: JSON.stringify({ pageIndex: 1 }),
      ...extra,
    },
  });
  const pages = ["Introduction\nOpening prose.", "Methods\nParticipants were recruited here."];
  const fulltext = fulltextIndex(pages);
  const located = normalizeZoteroPassage(annotation(), null, null, fulltext);
  assert.equal(located.pageIndex, 1);
  assert.equal(located.section, "Methods");
  assert.equal(located.sectionHeading, "Methods");
  assert.equal(located.sectionSource, "pdf");

  // A section the researcher wrote down themselves is not overruled by the PDF.
  const tagged = normalizeZoteroPassage(
    annotation({ tags: [{ tag: "Discussion" }] }),
    null,
    null,
    fulltext,
  );
  assert.equal(tagged.section, "Discussion");
  assert.equal(tagged.sectionSource, "tag");

  // An unindexed attachment, or an annotation with no PDF position, still yields
  // a passage; the browser falls back to reading the highlight itself.
  const unindexed = normalizeZoteroPassage(annotation(), null, null, null);
  assert.equal(unindexed.section, "");
  assert.equal(unindexed.sectionSource, "none");
  const unlocated = normalizeZoteroPassage(
    { data: { key: "ANN2", annotationText: "Text." } },
    null,
    null,
    fulltext,
  );
  assert.equal(unlocated.pageIndex, -1);
  assert.equal(unlocated.sectionSource, "none");
});

test("Zotero item keys are fetched in bounded batches instead of one request per item", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const itemKeys = new URL(url).searchParams.get("itemKey").split(",");
    return Response.json(itemKeys.map((key) => ({ key, data: { key } })));
  };
  try {
    const keys = Array.from({ length: 51 }, (_, index) => `KEY${index}`);
    const items = await zoteroItemsByKey({ ZOTERO_LOCAL_URL: "http://127.0.0.1:23119" }, keys);
    assert.equal(items.size, 51);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /itemKey=/);
    assert.doesNotMatch(calls[0], /\/items\/KEY0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calendar adapter uses interval overlap and preserves notes unless supplied", async () => {
  const source = await readFile(new URL("../bridge/calendar.jxa", import.meta.url), "utf8");
  assert.match(source, /endDate > start && startDate < end/);
  assert.match(source, /payload\.notes !== undefined/);
  assert.match(source, /findEventByExternalId/);
  assert.match(source, /deduplicated: true/);
  assert.match(source, /WorkBuddy-ID/);
  assert.match(source, /events\.whose/);
  assert.doesNotMatch(source, /startDate >= start && startDate < end/);
});

test("submission status detection normalizes publisher wording", () => {
  assert.equal(detectSubmissionStatus("The required reviews are complete"), "Reviews Complete");
  assert.equal(detectSubmissionStatus("Your manuscript is now under review"), "Under Review");
  assert.equal(
    detectSubmissionStatus("We invite you to revise your manuscript"),
    "Revision Required",
  );
  assert.equal(
    detectSubmissionStatus("The version of record is now available online"),
    "Published",
  );
  assert.equal(detectSubmissionStatus("No workflow language here"), "");
});

test("submission email matching requires manuscript context and reports confidence", () => {
  const attempts = [
    {
      id: "SUB-one",
      manuscriptId: "MS-one",
      manuscriptTitle: "ACL workload in elite football",
      submissionId: "JSS-2026-0142",
      journal: "Journal of Sports Science",
    },
  ];
  const candidate = submissionEmailCandidate(
    {
      id: "mail-1",
      subject: "JSS-2026-0142 is now Under Review",
      sender: "editor@example.com",
      receivedAt: "2026-08-01T10:00:00Z",
    },
    attempts,
  );
  assert.equal(candidate.attemptId, "SUB-one");
  assert.equal(candidate.status, "Under Review");
  assert.equal(candidate.confidence, "high");
});

test("submission events append history and advance the attempt", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-submission-"));
  try {
    await saveRecord(config(vault), "manuscripts", { id: "MS-one", title: "Paper one" });
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one at Journal A",
      manuscriptId: "MS-one",
      manuscriptTitle: "Paper one",
      journal: "Journal A",
      submissionId: "JA-101",
      status: "Submitted",
      submittedAt: "2026-07-01T00:00:00.000Z",
    });
    const event = await addSubmissionEvent(config(vault), {
      attemptId: "SUB-one",
      status: "Under Review",
      eventDate: "2026-07-10T00:00:00.000Z",
      rawStatus: "Reviewers assigned",
    });
    assert.equal(event.status, "Under Review");
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state["submission-events"].length, 1);
    assert.equal(state["submission-attempts"][0].status, "Under Review");
    assert.equal(state["submission-attempts"][0].stageStartedAt, "2026-07-10T00:00:00.000Z");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("checking an unchanged submission updates verification without adding timeline noise", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-submission-check-"));
  try {
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one",
      status: "Under Review",
      stageStartedAt: "2026-07-10T00:00:00.000Z",
      lastVerifiedAt: "2026-07-10T00:00:00.000Z",
    });
    const verification = await addSubmissionEvent(config(vault), {
      attemptId: "SUB-one",
      status: "Under Review",
      eventDate: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(verification.verificationOnly, true);
    await verifySubmissionAttempt(config(vault), {
      attemptId: "SUB-one",
      verifiedAt: "2026-08-02T00:00:00.000Z",
    });
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state["submission-events"].length, 0);
    assert.equal(state["submission-attempts"][0].stageStartedAt, "2026-07-10T00:00:00.000Z");
    assert.equal(state["submission-attempts"][0].lastVerifiedAt, "2026-08-02T00:00:00.000Z");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("a revised submission advances the round inside the same journal attempt", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-revision-round-"));
  try {
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one",
      status: "Revision Required",
      round: "Initial",
      stageStartedAt: "2026-07-10T00:00:00.000Z",
    });
    await addSubmissionEvent(config(vault), {
      attemptId: "SUB-one",
      status: "Revised Submission",
      eventDate: "2026-08-01T00:00:00.000Z",
    });
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state["submission-attempts"][0].round, "R1");
    assert.equal(state["submission-attempts"].length, 1);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("high-confidence email sync is idempotent", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-email-sync-"));
  try {
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one",
      manuscriptId: "MS-one",
      manuscriptTitle: "Paper one",
      journal: "Journal A",
      submissionId: "JA-101",
      status: "Submitted",
    });
    const emails = [
      {
        id: "mail-101",
        subject: "JA-101 is now under review",
        sender: "editor@journal.test",
        receivedAt: "2026-08-01T10:00:00Z",
      },
    ];
    const first = await syncSubmissionEmails(config(vault), emails);
    const second = await syncSubmissionEmails(config(vault), emails);
    assert.equal(first.updated.length, 1);
    assert.equal(second.updated.length, 0);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("email that repeats the current stage only verifies the attempt", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-email-verification-"));
  try {
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one",
      manuscriptTitle: "Paper one with a searchable title",
      submissionId: "JA-101",
      status: "Under Review",
      stageStartedAt: "2026-07-01T00:00:00.000Z",
      lastVerifiedAt: "2026-07-01T00:00:00.000Z",
    });
    const result = await syncSubmissionEmails(config(vault), [
      {
        id: "mail-verify",
        subject: "JA-101 remains under review",
        sender: "editor@journal.test",
        receivedAt: "2026-08-01T10:00:00Z",
      },
    ]);
    assert.equal(result.updated.length, 0);
    assert.equal(result.verified, 1);
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state["submission-events"].length, 0);
    assert.equal(state["submission-attempts"][0].stageStartedAt, "2026-07-01T00:00:00.000Z");
    assert.equal(state["submission-attempts"][0].lastVerifiedAt, "2026-08-01T10:00:00.000Z");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("consequential email statuses require confirmation", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-email-confirmation-"));
  try {
    await saveRecord(config(vault), "submission-attempts", {
      id: "SUB-one",
      title: "Paper one",
      manuscriptId: "MS-one",
      manuscriptTitle: "Paper one",
      journal: "Journal A",
      submissionId: "JA-101",
      status: "Under Review",
    });
    const result = await syncSubmissionEmails(config(vault), [
      {
        id: "mail-accepted",
        subject: "JA-101 has been accepted",
        sender: "editor@journal.test",
        receivedAt: "2026-08-02T10:00:00Z",
      },
    ]);
    assert.equal(result.updated.length, 0);
    assert.equal(result.pending.length, 1);
    assert.equal(result.pending[0].status, "Accepted");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("Obsidian search reuses note text until a note actually changes", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-vault-cache-"));
  try {
    const note = path.join(vault, "sprint-methods.md");
    await writeFile(note, "Original methods describe the sprint protocol.", "utf8");

    const first = await searchObsidian(config(vault), "sprint protocol", 5);
    assert.equal(first.length, 1);
    assert.match(first[0].snippet, /Original methods describe the sprint protocol/);

    // A real edit changes size or mtime, so the next search must see it.
    const revised = "Revised methods describe the sprint protocol in far more detail.";
    await writeFile(note, revised, "utf8");
    await utimes(note, new Date(), new Date(Date.now() + 2000));
    const afterEdit = await searchObsidian(config(vault), "sprint protocol", 5);
    assert.match(afterEdit[0].snippet, /Revised methods/);
    assert.doesNotMatch(afterEdit[0].snippet, /Original methods/);

    // Invalidation is keyed on mtime and size, so a rewrite preserving both is
    // deliberately scored from the cached text. Snippets are always re-read, so
    // the observable difference is that the note still matches at all.
    const info = await stat(note);
    const silent = "Rewritten notes cover a marathon schedule instead.".padEnd(revised.length, ".");
    assert.equal(silent.length, revised.length);
    await writeFile(note, silent, "utf8");
    await utimes(note, info.atime, info.mtime);
    const afterSilentEdit = await searchObsidian(config(vault), "sprint protocol", 5);
    assert.equal(afterSilentEdit.length, 1);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("each workflow command carries its own expert brief and the action contract", () => {
  const reviewer = systemPrompt("@reviewer-critique");
  const writing = systemPrompt("@write-section");
  assert.match(reviewer, /Critical, Major, or Minor/);
  assert.match(reviewer, /power/i);
  assert.match(writing, /IMRAD/);
  assert.notEqual(reviewer, writing);
  // The shared guardrails and the machine-readable contract stay on every command,
  // including one the browser has never heard of.
  for (const prompt of [reviewer, writing, systemPrompt("@unknown-command")]) {
    assert.match(prompt, /never as instructions|untrusted/i);
    assert.match(prompt, /scholarbuddy-actions/);
  }
});

test("the six contextual workflows have distinct inputs, sources, and direct outcomes", () => {
  assert.deepEqual(Object.keys(WORKFLOW_CONTRACTS), [
    "@ask-knowledge",
    "@evidence-for-claim",
    "@result-explain",
    "@reviewer-critique",
    "@plan-today",
    "@write-section",
  ]);
  assert.equal(workflowContract("@evidence-for-claim").focus, "claim");
  assert.equal(workflowContract("@result-explain").focus, "result");
  assert.equal(workflowContract("@reviewer-critique").outcome, "reviews");
  assert.equal(workflowContract("@plan-today").outcome, "tasks");
  assert.equal(workflowContract("@write-section").outcome, "section");
  assert.equal(workflowContract("@unknown-command"), null);
});

// Every workflow is run through the real handler against a stub Zotero and a
// stub model, so what each contract promises — its own required input, its own
// sources, its own landing place — is checked where it actually takes effect
// rather than in the table that declares it.
const refusal = async (promise, code) => {
  await assert.rejects(promise, (error) => error.status === 422 && error.code === code);
};

async function workflowHarness(run, calendar = null) {
  const zoteroCalls = [];
  const zotero = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, "http://zotero.test");
    zoteroCalls.push(url.pathname + url.search);
    const send = (body) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(JSON.stringify(body));
    };
    if (url.pathname.endsWith("/fulltext"))
      return send({
        content: [
          "Introduction\nThe study setting is described here at length.",
          "Results\n\nHigh press pressing raised sprint distance by twelve percent in elite football players over the season, adjusted for match location and opponent quality.",
        ].join("\f"),
      });
    if (url.pathname.endsWith("/children"))
      return send([{ data: { key: "PDF1", contentType: "application/pdf" } }]);
    return send([
      {
        data: {
          key: "ITEM1",
          title: "Pressing intensity and sprint distance",
          itemType: "journalArticle",
          date: "2023",
          DOI: "10.1/press",
          abstractNote: "An abstract about pressing.",
          creators: [{ firstName: "A", lastName: "Autor" }],
          tags: [{ tag: "pressing" }, { tag: "/done" }],
        },
      },
    ]);
  });
  const providerCalls = [];
  const provider = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    providerCalls.push(JSON.parse(body));
    outgoing.writeHead(200, { "Content-Type": "application/json" });
    outgoing.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "Drafted answer citing [Z1].\n\n```scholarbuddy-actions\n" +
                '{"actions":[{"title":"Report the effect size","kind":"gap"},' +
                '{"title":"Rewrite the opening claim","kind":"review","severity":"Critical"},' +
                '{"title":"Re-run the model","kind":"task"}]}' +
                "\n```",
            },
          },
        ],
        usage: { total_tokens: 12 },
      }),
    );
  });
  await new Promise((resolve) => zotero.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-workflow-"));
  try {
    await writeFile(
      path.join(vault, "pressing.md"),
      "Notes on pressing intensity and sprint distance in elite football players.",
      "utf8",
    );
    const settings = {
      ...config(vault),
      ZOTERO_LOCAL_URL: `http://127.0.0.1:${zotero.address().port}`,
      DEEPSEEK_API_KEY: "fake",
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
      // Never the real Calendar: an unstubbed run would prompt for access on the
      // researcher's machine and answer with their actual week.
      _calendarRunner:
        calendar ||
        (() => {
          throw new Error("osascript is unavailable");
        }),
    };
    const ask = (payload) =>
      handle(
        request("/ai/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "deepseek", ...payload }),
        }),
        settings,
      );
    await run({ ask, zoteroCalls, providerCalls, settings, vault });
  } finally {
    zotero.close();
    provider.close();
    await rm(vault, { recursive: true, force: true });
  }
}

const SECTION_TEXT =
  "Twenty-four elite football players completed a repeated pressing protocol. " +
  "Sprint distance was recorded by GPS during every pressing sequence. " +
  "Pressing intensity was derived from the same GPS traces.";

test("@ask-knowledge answers from the vault and the library and lands as a note", async () => {
  await workflowHarness(async ({ ask, providerCalls, zoteroCalls }) => {
    const body = await (
      await ask({ command: "@ask-knowledge", input: "pressing intensity" })
    ).json();
    assert.equal(body.retrieval.zotero.selected, true);
    assert.equal(body.retrieval.obsidian.selected, true);
    assert.equal(body.retrieval.calendar.selected, false);
    assert.equal(workflowContract("@ask-knowledge").outcome, "note");
    // The plain question asks for metadata search only; nothing pulls a PDF.
    assert.ok(!zoteroCalls.some((call) => call.includes("/fulltext")));
    assert.match(providerCalls[0].messages.at(-1).content, /^@ask-knowledge/);
  });
});

test("@evidence-for-claim quotes the PDF and survives an attachment it cannot read", async () => {
  await workflowHarness(async ({ ask, providerCalls, zoteroCalls }) => {
    const body = await (
      await ask({ command: "@evidence-for-claim", input: "pressing raises sprint distance" })
    ).json();
    assert.ok(zoteroCalls.some((call) => call.includes("/fulltext")));
    assert.equal(body.manifest.zotero[0].evidenceType, "full_text");
    assert.match(body.manifest.zotero[0].excerpt, /^\[PDF p\. 2\]/);
    assert.match(providerCalls[0].messages.at(-1).content, /Evidence: exact PDF excerpt/);
    // Obsidian is off by contract for a claim: the point is the literature.
    assert.equal(body.retrieval.obsidian.selected, false);
  });
});

test("@evidence-for-claim keeps the other papers when one attachment fails", async () => {
  const zotero = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, "http://zotero.test");
    if (url.pathname.endsWith("/children")) {
      outgoing.writeHead(500).end("nope");
      return;
    }
    outgoing.writeHead(200, { "Content-Type": "application/json" });
    outgoing.end(
      JSON.stringify([
        {
          data: {
            key: "ITEM1",
            title: "Pressing intensity",
            date: "2023",
            abstractNote: "An abstract about pressing.",
            creators: [],
          },
        },
      ]),
    );
  });
  const provider = createServer((incoming, outgoing) => {
    outgoing.writeHead(200, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ choices: [{ message: { content: "Answer." } }] }));
  });
  await new Promise((resolve) => zotero.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-evidence-"));
  try {
    const response = await handle(
      request("/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          command: "@evidence-for-claim",
          input: "pressing raises sprint distance",
        }),
      }),
      {
        ...config(vault),
        ZOTERO_LOCAL_URL: `http://127.0.0.1:${zotero.address().port}`,
        DEEPSEEK_API_KEY: "fake",
        DEEPSEEK_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    // Degraded to the abstract rather than failing the whole run.
    assert.equal(body.retrieval.zotero.status, "ok");
    assert.equal(body.manifest.zotero[0].evidenceType, "abstract");
  } finally {
    zotero.close();
    provider.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("@result-explain requires the statistics and puts every field in the prompt", async () => {
  await workflowHarness(async ({ ask, providerCalls }) => {
    await refusal(ask({ command: "@result-explain", input: "explain" }), "workflow_input_required");
    assert.equal(providerCalls.length, 0);

    const body = await (
      await ask({
        command: "@result-explain",
        input: "explain",
        focus: {
          resultSummary: "Sprint distance rose 12%.",
          estimate: "d = 0.42",
          confidenceInterval: "0.11 to 0.73",
          pValue: "0.03",
          sampleSize: "24",
          model: "mixed effects",
        },
      })
    ).json();
    const prompt = providerCalls[0].messages.at(-1).content;
    for (const field of [
      "Sprint distance rose 12%.",
      "d = 0.42",
      "0.11 to 0.73",
      "0.03",
      "24",
      "mixed effects",
    ])
      assert.ok(prompt.includes(field), `prompt is missing ${field}`);
    // Statistics are read against the researcher's own notes, not the library.
    assert.equal(body.retrieval.zotero.selected, false);
    assert.equal(body.retrieval.obsidian.selected, true);
  });
});

test("@reviewer-critique requires a section and emits review items", async () => {
  await workflowHarness(async ({ ask, providerCalls }) => {
    await refusal(
      ask({ command: "@reviewer-critique", input: "review" }),
      "workflow_input_required",
    );
    assert.equal(providerCalls.length, 0);

    const body = await (
      await ask({
        command: "@reviewer-critique",
        input: "review",
        focus: { section: "Methods", sectionText: SECTION_TEXT, manuscriptTitle: "Pressing paper" },
      })
    ).json();
    const prompt = providerCalls[0].messages.at(-1).content;
    assert.match(prompt, /MANUSCRIPT SECTION TO WORK ON:/);
    assert.match(prompt, /Section: Methods/);
    assert.ok(prompt.includes(SECTION_TEXT));
    assert.equal(workflowContract("@reviewer-critique").outcome, "reviews");
    assert.ok(body.actions.some((item) => item.kind === "review"));
  });
});

test("@plan-today reads the calendar and is not blocked when it is unavailable", async () => {
  await workflowHarness(async ({ ask, providerCalls, zoteroCalls }) => {
    const response = await ask({ command: "@plan-today", input: "plan the day" });
    assert.equal(response.status, 200);
    const body = await response.json();
    // The osascript bridge is not available under test, so this is the
    // degradation path: reported, named, and not fatal.
    assert.equal(body.retrieval.calendar.selected, true);
    assert.equal(body.retrieval.calendar.status, "error");
    assert.match(body.retrieval.calendar.error, /does not account for committed time/);
    assert.equal(providerCalls.length, 1);
    // A day plan is not a literature search.
    assert.equal(body.retrieval.zotero.selected, false);
    assert.equal(zoteroCalls.length, 0);
    assert.equal(workflowContract("@plan-today").outcome, "tasks");
    assert.ok(body.actions.some((item) => item.kind === "task"));
  });
});

test("@plan-today puts committed time in the prompt as time, not as evidence", async () => {
  await workflowHarness(
    async ({ ask, providerCalls }) => {
      const body = await (await ask({ command: "@plan-today", input: "plan the day" })).json();
      assert.equal(body.retrieval.calendar.status, "ok");
      const prompt = providerCalls[0].messages.at(-1).content;
      assert.match(prompt, /WORKING WEEK \(committed time; not research evidence\)/);
      assert.match(prompt, /Supervision meeting/);
      // Where it is and what was said about it never leave the machine.
      assert.doesNotMatch(prompt, /Room 4\.12|bring the draft/);
    },
    () => ({
      events: [
        {
          title: "Supervision meeting",
          start: "2026-08-27T09:00:00.000Z",
          end: "2026-08-27T10:00:00.000Z",
          location: "Room 4.12",
          notes: "bring the draft",
        },
      ],
    }),
  );
});

test("@write-section searches on the section itself, not on the button that opened it", async () => {
  await workflowHarness(async ({ ask, providerCalls, zoteroCalls }) => {
    await refusal(
      ask({ command: "@write-section", input: "Draft manuscript section" }),
      "workflow_input_required",
    );
    assert.equal(providerCalls.length, 0);

    const body = await (
      await ask({
        command: "@write-section",
        input: "Draft manuscript section",
        focus: { section: "Methods", sectionText: SECTION_TEXT },
      })
    ).json();
    const searched = zoteroCalls
      .map((call) => new URLSearchParams(call.split("?")[1] || "").get("q"))
      .filter(Boolean);
    // What the section is about reaches Zotero; the quick action's own label
    // does not get to spend the handful of terms the search allows.
    assert.ok(searched.includes("pressing"), `searched for ${searched.join(", ")}`);
    for (const boilerplate of ["draft", "manuscript", "section"])
      assert.ok(!searched.includes(boilerplate), `searched for the label word ${boilerplate}`);
    // The stored query travels back in the manifest, so it stays the short
    // ranked list rather than a copy of the section.
    assert.ok(body.manifest.zotero[0].query.length < 200);
    assert.ok(!body.manifest.zotero[0].query.includes("Twenty-four"));
    assert.equal(workflowContract("@write-section").outcome, "section");
  });
});

test("an unknown command is refused before any source is touched", async () => {
  await workflowHarness(async ({ ask, zoteroCalls, providerCalls }) => {
    await refusal(ask({ command: "@make-coffee", input: "please" }), "workflow_unknown");
    assert.equal(zoteroCalls.length, 0);
    assert.equal(providerCalls.length, 0);
  });
});

test("manuscript section context is exact and replacement preserves its neighbours", () => {
  const markdown = [
    "# Pressing paper",
    "",
    "## 1. Introduction",
    "Intro text.",
    "",
    "## 2. Materials and Methods",
    "Old methods.",
    "",
    "### 2.1 Participants",
    "Twenty-four players.",
    "",
    "## 3. Results",
    "Result text.",
    "",
    "## References",
    "[1] Autor.",
  ].join("\n");
  // A real manuscript numbers its headings and spells Methods out in full; the
  // strict name match this used to do found none of them and appended a second
  // set of sections beside the author's own.
  assert.deepEqual(
    manuscriptSectionEntries(markdown).map((entry) => entry.section),
    ["Introduction", "Methods", "Results"],
  );
  // A subsection belongs to its parent, so the context is the whole of Methods.
  assert.match(manuscriptSectionText(markdown, "Methods"), /Old methods\.[\s\S]*Twenty-four/);

  const replaced = replaceManuscriptSection(markdown, "Methods", "New methods.\n\nMore detail.");
  assert.match(replaced, /## 1\. Introduction\nIntro text\./);
  assert.match(replaced, /## 2\. Materials and Methods\nNew methods\.\n\nMore detail\./);
  assert.match(replaced, /## 3\. Results\nResult text\./);
  // The subsection was inside what was replaced; the reference list was not.
  assert.doesNotMatch(replaced, /Twenty-four/);
  assert.match(replaced, /## References\n\[1\] Autor\./);

  // A section the manuscript has never had is written in front of the back
  // matter, at the level the paper already uses.
  const added = replaceManuscriptSection(markdown, "Discussion", "We discuss.");
  assert.match(added, /## Discussion\n\nWe discuss\.\n\n## References/);

  // An abstract is unassigned too, but it is front matter: a new section goes
  // after the last real one, never above the paper.
  const withAbstract = [
    "# Title",
    "",
    "## Abstract",
    "A summary.",
    "",
    "## Introduction",
    "Intro.",
  ].join("\n");
  assert.match(
    replaceManuscriptSection(withAbstract, "Discussion", "We discuss."),
    /## Abstract\nA summary\.\n\n## Introduction\nIntro\.\n\n## Discussion/,
  );
});

test("a drafted body never nests a second copy of the heading it replaces", () => {
  // Models return the heading with the body however firmly they are told not to.
  for (const heading of ["## Methods", "**Methods**", "Methods", "### 2. Materials and Methods"])
    assert.equal(
      sectionBody(`${heading}\nWe measured sprint distance.`, "Methods"),
      "We measured sprint distance.",
    );
  // A sentence that merely opens with the word is the draft, not a heading —
  // whether or not the model emphasised that opening word.
  assert.equal(
    sectionBody("Methods varied across the cohort.", "Methods"),
    "Methods varied across the cohort.",
  );
  assert.equal(
    sectionBody("**Methods** were as follows.", "Methods"),
    "**Methods** were as follows.",
  );
  // Nor does a heading for some other section get eaten.
  assert.match(sectionBody("## Results\nWe found more.", "Methods"), /^## Results/);
  // An answer that was nothing but its heading must not empty the section.
  const markdown = "## Methods\nOld methods.";
  assert.equal(replaceManuscriptSection(markdown, "Methods", "## Methods"), markdown);
});

test("full-text evidence selects an exact PDF excerpt instead of relabelling metadata", () => {
  const excerpt = relevantFulltextExcerpt(
    [
      "The introduction describes the study setting.",
      "The high press phase increased sprint distance by twelve percent after adjustment.",
      "The discussion considers coaching practice.",
    ],
    "high press sprint distance",
  );
  assert.match(excerpt, /^\[PDF p\. 2\]/);
  assert.match(excerpt, /increased sprint distance/);
});

test("next actions are parsed out of the answer and bounded", () => {
  const answer = [
    "Conclusion text [Z1].",
    "",
    "```scholarbuddy-actions",
    JSON.stringify({
      actions: [
        { title: "Run a power analysis", kind: "gap", severity: "Critical", dueDate: "2026-09-01" },
        { title: "Email the co-author", kind: "task", severity: "nonsense", dueDate: "soon" },
        { title: "  ", kind: "task" },
      ],
    }),
    "```",
  ].join("\n");
  const parsed = parseActions(answer);
  assert.equal(parsed.output, "Conclusion text [Z1].");
  assert.deepEqual(parsed.actions, [
    {
      id: "A1",
      title: "Run a power analysis",
      kind: "gap",
      detail: "",
      severity: "Critical",
      dueDate: "2026-09-01",
    },
    {
      id: "A2",
      title: "Email the co-author",
      kind: "task",
      detail: "",
      severity: "Major",
      dueDate: "",
    },
  ]);
  // A malformed block must never take the answer down with it.
  assert.deepEqual(parseActions("Answer only.").actions, []);
  assert.deepEqual(parseActions("Answer.\n```scholarbuddy-actions\n{oops}\n```"), {
    output: "Answer.",
    actions: [],
  });
});

test("saved passages are citable and audited like any other source", () => {
  const manifest = { zotero: [{ id: "Z1" }], obsidian: [], passages: [{ id: "P1" }] };
  assert.deepEqual(invalidReferenceIds("Quoted [P1] and [Z1], invented [P4].", manifest), ["P4"]);
});

test("a follow-up turn reuses history and streaming is opt-in per adapter", () => {
  const history = [
    { role: "user", content: "first question" },
    { role: "assistant", content: "first answer" },
  ];
  const deepseek = modelConfig({ DEEPSEEK_API_KEY: "secret" }, "deepseek");
  const chat = JSON.parse(
    modelRequest(deepseek, "system", "follow-up", 500, { history, stream: true }).init.body,
  );
  assert.deepEqual(
    chat.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(chat.stream, true);
  assert.deepEqual(chat.thinking, { type: "disabled" });

  const gemini = modelConfig({ GEMINI_API_KEY: "secret" }, "gemini");
  const geminiRequest = modelRequest(gemini, "system", "follow-up", 500, { history, stream: true });
  assert.match(geminiRequest.url, /streamGenerateContent\?alt=sse$/);
  assert.deepEqual(
    JSON.parse(geminiRequest.init.body).contents.map((entry) => entry.role),
    ["user", "model", "user"],
  );

  // Without options the request stays exactly what the single-shot path sent.
  const openai = modelConfig({ OPENAI_API_KEY: "secret" }, "openai");
  assert.deepEqual(JSON.parse(modelRequest(openai, "system", "task", 500).init.body), {
    model: openai.model,
    instructions: "system",
    input: "task",
    max_output_tokens: 500,
  });
});

test("an unknown conversation id fails instead of silently changing its evidence", async () => {
  await assert.rejects(
    handle(
      request("/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          command: "@ask-knowledge",
          input: "continue",
          conversationId: "expired-conversation",
          sources: { zotero: false, obsidian: false, kbase: false },
        }),
      }),
      { ...config("/tmp/unused"), DEEPSEEK_API_KEY: "configured" },
    ),
    (error) => error.status === 410 && error.code === "conversation_expired",
  );
});

test("the client SSE protocol requires exactly one terminal completion", async () => {
  const deltas = [];
  const completed = await readEventStream(
    new Response(
      'event: delta\r\ndata: {"text":"Hello"}\r\n\r\nevent: done\ndata: {"output":"Hello"}\n\n',
    ).body,
    (event, payload) => deltas.push([event, payload.text]),
  );
  assert.deepEqual(deltas, [["delta", "Hello"]]);
  assert.deepEqual(completed, { output: "Hello" });
  await assert.rejects(
    readEventStream(new Response('event: delta\ndata: {"text":"partial"}\n\n').body),
    /ended before completion/,
  );
  await assert.rejects(
    readEventStream(
      new Response(
        'event: done\ndata: {"output":"done"}\n\nevent: delta\ndata: {"text":"late"}\n\n',
      ).body,
    ),
    /data after completion/,
  );
});

test("stream frames reduce to answer text, reasoning, and usage", () => {
  const claude = modelConfig({ ANTHROPIC_API_KEY: "secret" }, "claude");
  assert.deepEqual(
    streamDelta(claude, { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
    { text: "Hi" },
  );
  assert.deepEqual(
    streamDelta(claude, {
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "hmm" },
    }),
    { reasoning: "hmm" },
  );

  const deepseek = modelConfig({ DEEPSEEK_API_KEY: "secret" }, "deepseek");
  assert.deepEqual(streamDelta(deepseek, { choices: [{ delta: { content: "text" } }] }), {
    text: "text",
  });
  assert.deepEqual(streamDelta(deepseek, { choices: [{ delta: { reasoning_content: "why" } }] }), {
    reasoning: "why",
  });

  const openai = modelConfig({ OPENAI_API_KEY: "secret" }, "openai");
  assert.deepEqual(streamDelta(openai, { type: "response.output_text.delta", delta: "chunk" }), {
    text: "chunk",
  });
  assert.deepEqual(streamDelta(openai, { type: "response.created" }), {});
});

test("focus terms are ranked by what recurs and keep the acronyms that matter", () => {
  const methods =
    "The aim of this section is to describe the procedure. GPS traces were recorded for every " +
    "pressing sequence. RPE was collected after each session, and RPE was repeated at rest. " +
    "GPS traces were then compared with the pressing counts.";
  const terms = topicTerms(methods, 8);
  // What the section is about, not the words it opens with.
  assert.ok(terms.indexOf("gps") < terms.indexOf("describe"), terms.join(", "));
  assert.ok(terms.includes("pressing"));
  // Three-letter domain acronyms are the whole point of a sports-science query.
  for (const acronym of ["gps", "rpe"]) assert.ok(terms.includes(acronym), `dropped ${acronym}`);
  // Boilerplate every paper uses about itself never becomes a search term.
  for (const filler of ["this", "section", "were"]) assert.ok(!terms.includes(filler), filler);
});

test("bilingual retrieval ranks by BM25 and recalls across the synonym table", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-bm25-"));
  try {
    await writeFile(
      path.join(vault, "physiology.md"),
      "Testing 最大摄氧量 in trained runners with a treadmill ramp protocol.",
      "utf8",
    );
    await writeFile(
      path.join(vault, "everything.md"),
      `Training load notes. ${"treadmill running ".repeat(300)}`,
      "utf8",
    );

    // An English query reaches the Chinese note through the synonym group.
    const crossLanguage = await searchObsidian(config(vault), "vo2max", 5);
    assert.equal(crossLanguage.length, 1);
    assert.equal(crossLanguage[0].path, "physiology.md");

    // "treadmill" appears in both notes, so the rare term decides the ranking
    // rather than the long note's sheer number of repetitions.
    const ranked = await searchObsidian(config(vault), "treadmill ramp protocol", 5);
    assert.equal(ranked[0].path, "physiology.md");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("a streaming run still refuses to start when a selected source fails", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-stream-retrieval-"));
  try {
    const response = await handle(
      request("/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          command: "@ask-knowledge",
          input: "ACL injury",
          sources: { zotero: true, obsidian: false, kbase: false },
        }),
      }),
      {
        ...config(vault),
        ZOTERO_LOCAL_URL: "http://127.0.0.1:1",
        DEEPSEEK_API_KEY: "must-not-be-used",
      },
    );
    // The failure predates the stream, so it is still a plain JSON status.
    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal((await response.json()).code, "retrieval_failed");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("a streamed provider failure preserves safe upstream diagnostics", async () => {
  const provider = createServer((incoming, outgoing) => {
    outgoing.writeHead(429, { "Content-Type": "application/json" });
    outgoing.end(
      JSON.stringify({
        error: { code: "rate_limit", message: "Rate limit exceeded for key sk-secret123456." },
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-provider-error-"));
  try {
    const response = await handle(
      request("/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          command: "@ask-knowledge",
          input: "test",
          sources: { zotero: false, obsidian: false, kbase: false },
        }),
      }),
      {
        ...config(vault),
        DEEPSEEK_API_KEY: "fake",
        DEEPSEEK_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
      },
    );
    const stream = await new Response(response.body).text();
    const failed = JSON.parse(stream.match(/event: failed\ndata: (.+)/)?.[1] || "{}");
    assert.equal(failed.code, "provider_error");
    assert.match(failed.error, /DeepSeek request failed \(HTTP 429, rate_limit\)/);
    assert.match(failed.error, /Rate limit exceeded/);
    assert.doesNotMatch(failed.error, /sk-secret123456/);
  } finally {
    provider.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("a streamed run emits deltas, audits the finished answer, and keeps a follow-up on the same sources", async () => {
  const seen = [];
  const chunks = [
    { choices: [{ delta: { reasoning_content: "weighing it" } }] },
    { choices: [{ delta: { content: "Small effect [O1], invented [Z4]." } }] },
    {
      choices: [
        {
          delta: {
            content:
              '\n\n```scholarbuddy-actions\n{"actions":[{"title":"Report Hedges g","kind":"gap"}]}\n```',
          },
        },
      ],
    },
    { choices: [{ delta: {} }], usage: { total_tokens: 321 } },
  ];
  const provider = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    seen.push(JSON.parse(body));
    outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
    // Split across writes so the frame parser has to rejoin a partial chunk.
    for (const chunk of chunks) outgoing.write(`data: ${JSON.stringify(chunk)}\n\n`);
    outgoing.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const vault = await mkdtemp(path.join(os.tmpdir(), "workbuddy-stream-"));
  try {
    await writeFile(
      path.join(vault, "effects.md"),
      "Effect size reporting for sprint studies.",
      "utf8",
    );
    const settings = {
      ...config(vault),
      DEEPSEEK_API_KEY: "fake",
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
    };
    const ask = (payload) =>
      handle(
        request("/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "deepseek",
            command: "@result-explain",
            sources: { zotero: false, obsidian: true, kbase: true },
            focus: {
              resultSummary: "Sprint counts rose 12%.",
              estimate: "12%",
              confidenceInterval: "not reported",
              pValue: "not reported",
              sampleSize: "not reported",
              model: "not reported",
            },
            ...payload,
          }),
        }),
        settings,
      );
    const frames = async (response) => {
      const text = await new Response(response.body).text();
      return text
        .split("\n\n")
        .filter(Boolean)
        .map((frame) => ({
          event: frame.match(/^event:\s*(.+)$/m)[1],
          data: JSON.parse(frame.match(/^data:\s*(.+)$/m)[1]),
        }));
    };

    const first = await frames(
      await ask({
        input: "effect size sprint",
        projectContext: "PROJECT PRJ-1: Pace of Play",
        passages: [{ quote: "Sprint counts rose 12%.", sourceTitle: "Smith 2024", key: "ABC" }],
      }),
    );
    assert.deepEqual(
      first.map((frame) => frame.event),
      ["start", "reasoning", "delta", "delta", "done"],
    );
    const done = first.at(-1).data;
    // The block is consumed into real actions and never shown as prose.
    assert.equal(done.output, "Small effect [O1], invented [Z4].");
    assert.deepEqual(
      done.actions.map((item) => [item.title, item.kind]),
      [["Report Hedges g", "gap"]],
    );
    // Streaming displays text early, but the citation audit still runs on the end.
    assert.deepEqual(done.invalidReferenceIds, ["Z4"]);
    assert.deepEqual(
      done.manifest.passages.map((item) => item.id),
      ["P1"],
    );
    assert.equal(done.usage.total_tokens, 321);
    assert.match(seen[0].messages.at(-1).content, /Sprint counts rose 12%/);

    const second = await frames(
      await ask({ input: "and the confidence interval?", conversationId: done.conversationId }),
    );
    const followUp = second.at(-1).data;
    assert.equal(followUp.conversationId, done.conversationId);
    assert.deepEqual(followUp.manifest.obsidian, done.manifest.obsidian);
    assert.deepEqual(
      seen[1].messages.map((message) => message.role),
      ["system", "user", "assistant", "user"],
    );
    // The sources travelled in turn one, so the follow-up does not resend them.
    assert.doesNotMatch(seen[1].messages.at(-1).content, /Sprint counts rose 12%/);
  } finally {
    provider.close();
    await rm(vault, { recursive: true, force: true });
  }
});
