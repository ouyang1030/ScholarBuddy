import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inLanguage, languageFrom, MESSAGES } from "../bridge/i18n.mjs";
import { reminderCandidates, reminderNotification } from "../bridge/reminder-rules.mjs";
import { createReminderService } from "../bridge/reminders.mjs";
import { handle } from "../bridge/server.mjs";

const origin = "https://workbench.example";
const token = "test-token-with-at-least-thirty-two-characters";
const config = (vault) => ({
  SCHOLARBUDDY_ORIGINS: origin,
  OBSIDIAN_VAULT_PATH: vault,
  _activityDirectory: path.join(vault, ".test-activity"),
  _bridgeToken: token,
});
const local = (pathname, headers = {}) =>
  new Request(`http://127.0.0.1:32145${pathname}`, { headers });
const paired = (pathname, headers = {}) =>
  local(pathname, { Origin: origin, Authorization: `Bearer ${token}`, ...headers });

function leaves(node, trail = []) {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? leaves(value, [...trail, key])
      : [[[...trail, key], value]],
  );
}

test("every Bridge message exists in both languages with the same arguments", () => {
  const english = new Map(leaves(MESSAGES.en).map(([key, value]) => [key.join("."), value]));
  const chinese = new Map(leaves(MESSAGES.zh).map(([key, value]) => [key.join("."), value]));
  assert.deepEqual([...chinese.keys()].sort(), [...english.keys()].sort());
  for (const [key, value] of english) {
    const other = chinese.get(key);
    assert.equal(typeof other, typeof value, key);
    if (typeof value === "function") assert.equal(other.length, value.length, key);
    const sample = (message) =>
      typeof message === "function" ? message(...Array(message.length).fill("x")) : message;
    assert.ok(sample(value).trim() && sample(other).trim(), key);
  }
});

test("only Chinese is answered in Chinese", () => {
  for (const value of ["zh", "zh-CN", "zh-TW,zh;q=0.9", " ZH-cn "])
    assert.equal(languageFrom(value), "zh");
  for (const value of ["", "en", "en-GB,zh;q=0.8", "fr", "zhx", null])
    assert.equal(languageFrom(value), "en");
});

test("the setup and pairing pages speak the language they are opened in", async () => {
  const settings = config("/tmp/unused");
  const english = await (await handle(local("/setup"), settings)).text();
  assert.match(english, /<html lang="en">/);
  assert.match(english, /Set up ScholarBuddy/);
  const chinese = await (await handle(local("/setup?lang=zh&return=x"), settings)).text();
  assert.match(chinese, /<html lang="zh-CN">/);
  assert.match(chinese, /设置 ScholarBuddy/);
  assert.match(chinese, /"language":"zh"/);
  // Its own script reports in the page's language too.
  assert.match(chinese, /"noGrants":"还没有浏览器与这台 Mac 配对。"/);
  // The setup session is still issued whichever language the page is in.
  assert.match(chinese, /"session":"[A-Za-z0-9_-]+"/);
  // Opened without a choice, the browser's language decides.
  assert.match(
    await (await handle(local("/setup", { "Accept-Language": "zh-CN,zh;q=0.9" }), settings)).text(),
    /<html lang="zh-CN">/,
  );
  const pairing = await (await handle(local("/pair?lang=zh"), settings)).text();
  assert.match(pairing, /五分钟内有效/);
  assert.match(pairing, /<code id="token">[^<]+</);
  assert.match(await (await handle(local("/pair"), settings)).text(), /expires in five minutes/);
});

test("setup refusals come back in the page's language", async () => {
  const settings = config("/tmp/unused");
  const page = await (await handle(local("/setup?lang=zh"), settings)).text();
  const session = page.match(/"session":"([A-Za-z0-9_-]+)"/)[1];
  const save = (language) =>
    handle(
      new Request("http://127.0.0.1:32145/setup/config", {
        method: "POST",
        headers: {
          "X-ScholarBuddy-Setup": session,
          "Content-Type": "application/json",
          "Accept-Language": language,
        },
        body: JSON.stringify({ vaultPath: "relative/path" }),
      }),
      settings,
    );
  // handle() throws; the server turns the refusal into JSON with this message.
  await assert.rejects(save("zh-CN"), {
    status: 422,
    message: "请选择有效的 Obsidian 库绝对路径。",
  });
  await assert.rejects(save("en"), {
    status: 422,
    message: "Choose a valid absolute Obsidian vault path.",
  });
});

test("a note that cannot be loaded is explained in the workbench's language", async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "scholarbuddy-i18n-"));
  try {
    const folder = path.join(vault, "ScholarBuddy", "operations");
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "OPS-HANDMADE.md"),
      "---\ntitle: Budget\ndueDate: soon\n---\n",
    );
    const reason = async (headers) =>
      (await (await handle(paired("/workbench/state", headers), config(vault))).json()).invalid[0]
        .reason;
    assert.equal(await reason({ "Accept-Language": "zh-CN" }), "dueDate 不是有效日期。");
    assert.equal(await reason({}), "dueDate must be a valid date.");
    // Refusals the browser explains by code still carry the Bridge's own words.
    const refused = await handle(
      local("/workbench/state", { Origin: origin, "Accept-Language": "zh-CN" }),
      config(vault),
    );
    assert.equal(refused.status, 401);
    assert.deepEqual(await refused.json(), {
      error: "请先将此浏览器与 Bridge 配对。",
      code: "pairing_required",
    });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("notifications are written in the language they are asked for", () => {
  const settings = { enabled: true, calendar: true, operations: true };
  const operation = {
    id: "OPS-1",
    title: "Submit abstract",
    status: "Planned",
    dueDate: "2026-10-15",
  };
  const now = new Date("2026-10-14T10:00:00+02:00");
  const [chinese] = reminderCandidates({ settings, operations: [operation], now, language: "zh" });
  assert.equal(chinese.detail, "2026-10-15 截止");
  const due = reminderCandidates({ settings, operations: [operation], now, language: "zh" }).filter(
    (item) => item.when <= +now,
  );
  const notification = reminderNotification(due, "https://scholarbuddy.tech", "zh");
  assert.equal(notification.title, "事务截止提醒");
  assert.equal(notification.body, "Submit abstract — 2026-10-15 截止");
  // The default stays English, which is what every older caller relied on.
  assert.equal(reminderNotification(due, "https://scholarbuddy.tech").title, "Operation deadline");
});

test("reminders remember the workbench's language and each viewer reads problems in theirs", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scholarbuddy-reminder-language-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sent = [];
  const native = async (action, payload) => {
    if (action === "send") sent.push(payload);
    return { permission: "granted", calendarPermission: "granted", events: [] };
  };
  const options = {
    directory,
    native,
    clock: () => new Date("2026-10-14T10:00:00+02:00"),
    readOperations: async () => ({
      records: [
        { id: "OPS-1", title: "Submit abstract", status: "Planned", dueDate: "2026-10-15" },
      ],
      invalid: [{ collection: "operations", file: "OPS-X.md", reason: "x" }],
    }),
  };
  const service = createReminderService(options);
  await service.useLanguage("zh");
  await service.update({ enabled: true }, "https://scholarbuddy.tech");
  await service.tick();
  assert.equal(sent.at(-1).title, "事务截止提醒");
  // The choice survives a restart: it is saved with the settings.
  assert.equal(
    JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")).language,
    "zh",
  );
  const restarted = createReminderService(options);
  await restarted.tick();
  assert.equal((await restarted.status()).settings.enabled, true);
  // Problems are kept as keys, so an English viewer reads them in English.
  assert.match((await restarted.status()).sourceErrors.operations, /^1 Operations note/);
  await inLanguage("zh", async () =>
    assert.match((await restarted.status()).sourceErrors.operations, /^1 条事务笔记/),
  );
  // Switching the workbench back to English switches the notifications too.
  await restarted.useLanguage("en");
  assert.equal(
    JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")).language,
    "en",
  );
});

test("someone who never turned reminders on gets no settings file for the language", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scholarbuddy-reminder-untouched-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = createReminderService({
    directory,
    native: async () => ({ permission: "granted", calendarPermission: "granted" }),
    readOperations: async () => [],
  });
  await service.useLanguage("zh");
  await assert.rejects(readFile(path.join(directory, "state.json")), { code: "ENOENT" });
});

test("the running server answers in the request's language", async () => {
  const { createBridgeServer } = await import("../bridge/server.mjs");
  const server = createBridgeServer(Promise.resolve(config("/tmp/unused")));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const ask = (language) =>
      fetch(`http://127.0.0.1:${port}/status`, {
        headers: { Origin: origin, "Accept-Language": language },
      }).then((response) => response.json());
    assert.equal((await ask("zh-CN")).error, "请先将此浏览器与 Bridge 配对。");
    assert.equal((await ask("en-GB")).error, "Pair this browser with the local bridge.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
