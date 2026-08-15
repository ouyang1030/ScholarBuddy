import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addSubmissionEvent,
  authorize,
  detectSubmissionStatus,
  handle,
  invalidCitations,
  issuePairingCode,
  modelConfig,
  modelRequest,
  modelResponse,
  normalizeZoteroPassage,
  parseRecord,
  saveRecord,
  searchObsidian,
  streamDelta,
  submissionEmailCandidate,
  syncSubmissionEmails,
} from "../bridge/server.mjs";
import { parseActions, systemPrompt } from "../bridge/prompts.mjs";
import { parseEnv, updateLocalConfig } from "../bridge/local-settings.mjs";

const allowedOrigin = "https://workbench.example";
const bridgeToken = "test-token-with-at-least-thirty-two-characters";

function config(vault) {
  return {
    WORKBUDDY_ORIGINS: allowedOrigin,
    OBSIDIAN_VAULT_PATH: vault,
    _bridgeToken: bridgeToken,
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
      saveRecord(config(vault), "projects", { id: first.id, title: "Missing revision" }),
      (error) => error.status === 428 && error.code === "revision_required",
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
    const state = await (await handle(request("/workbench/state"), config(vault))).json();
    assert.equal(state.projects.filter((project) => project.active).length, 1);
    assert.equal(state.projects.find((project) => project.active).id, "PRJ-two");
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
  assert.deepEqual(invalidCitations("Supported [Z1] [O1], invented [Z9] and [O7].", manifest), [
    "Z9",
    "O7",
  ]);
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
  assert.deepEqual(invalidCitations("Quoted [P1] and [Z1], invented [P4].", manifest), ["P4"]);
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
    assert.deepEqual(done.invalidCitations, ["Z4"]);
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
