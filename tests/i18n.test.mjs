import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  GENERIC_RECORD_STATUSES,
  MANUSCRIPT_SECTIONS,
  OPERATION_TYPES,
  RECORD_STATUS_OPTIONS,
} from "../shared/constants.mjs";

// The dictionaries are TypeScript; the type-only imports they carry vanish when
// transpiled, so each one loads on its own.
async function load(name) {
  const source = await readFile(new URL(`../app/i18n/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`);
}

function leaves(node, path = []) {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" ? leaves(value, [...path, key]) : [[[...path, key], value]],
  );
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

test("every message exists in both languages, with the same shape, and none is empty", async () => {
  const { en } = await load("en");
  const { zh } = await load("zh");
  const english = new Map(leaves(en).map(([path, value]) => [path.join("."), value]));
  const chinese = new Map(leaves(zh).map(([path, value]) => [path.join("."), value]));
  assert.deepEqual([...chinese.keys()].sort(), [...english.keys()].sort());
  for (const [key, value] of english) {
    const other = chinese.get(key);
    assert.equal(typeof other, typeof value, key);
    if (typeof value === "function") {
      assert.equal(other.length, value.length, `${key} takes the same arguments`);
      const sample = Array.from({ length: value.length }, () => 2);
      assert.ok(String(other(...sample)).trim(), key);
    } else {
      assert.ok(value.trim(), `${key} is empty in English`);
      assert.ok(other.trim(), `${key} is empty in Chinese`);
    }
  }
});

test("the guide has the same sections in both languages", async () => {
  const { GUIDES } = await load("guide");
  const shape = (guide) =>
    guide.sections.map((section) => [
      section.id,
      section.layout,
      section.items.length,
      section.callouts?.length ?? 0,
      Boolean(section.openConnections),
    ]);
  assert.deepEqual(shape(GUIDES.zh), shape(GUIDES.en));
});

// Stored values stay English in the vault; the interface only shows them in the
// chosen language. Every value the workbench can write needs a label in both.
test("every stored vocabulary value has a label in both languages", async () => {
  for (const name of ["en", "zh"]) {
    const { [name]: messages } = await load(name);
    const statuses = [...GENERIC_RECORD_STATUSES, ...Object.values(RECORD_STATUS_OPTIONS).flat()];
    for (const status of statuses)
      assert.ok(messages.values.status[status], `${name}: status ${status}`);
    for (const type of OPERATION_TYPES)
      assert.ok(messages.values.operationType[type], `${name}: operation type ${type}`);
    for (const section of MANUSCRIPT_SECTIONS)
      assert.ok(messages.values.section[section], `${name}: section ${section}`);
    // The key is the stored value, which English shows as it is.
    if (name === "en")
      for (const [key, label] of Object.entries(messages.values.status)) assert.equal(label, key);
  }
  // A choice made in Chinese is still written as the English value.
  const editor = await readFile(
    new URL("../app/components/drawers/RecordEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(editor, /<option key=\{value\} value=\{value\}>\s*\{valueLabel\(labels, value\)\}/);
});

test("the server renders the chosen language in the first frame", async () => {
  const chinese = await render({ cookie: "scholarbuddy-locale=zh" });
  const policy = chinese.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/script-src [^;]*'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  const html = await chinese.text();
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /今日日程/);
  assert.match(html, /正在加载记录…/);
  assert.doesNotMatch(html, /TODAY’S SCHEDULE/);
  assert.deepEqual(
    (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => !tag.includes(`nonce="${nonce}"`)),
    [],
  );
  // Without a choice the browser's language decides; a choice always wins.
  assert.match(
    await (await render({ "accept-language": "zh-CN,zh;q=0.9" })).text(),
    /lang="zh-CN"/,
  );
  assert.match(
    await (await render({ cookie: "scholarbuddy-locale=en", "accept-language": "zh-CN" })).text(),
    /<html lang="en"/,
  );
  assert.match(
    await (await render({ cookie: "scholarbuddy-locale=fr" })).text(),
    /<html lang="en"/,
  );
});

test("the Bridge is told the interface language on every request", async () => {
  const client = await readFile(new URL("../app/lib/bridge-client.ts", import.meta.url), "utf8");
  // Accept-Language is CORS-safelisted, so an older Bridge still accepts the request.
  assert.match(
    client,
    /headers\.set\("Accept-Language", interfaceLanguage\(\) === "zh" \? "zh-CN" : "en"\)/,
  );
  assert.match(client, /\/setup\?lang=\$\{interfaceLanguage\(\)\}/);
  assert.match(client, /\/pair\?lang=\$\{interfaceLanguage\(\)\}/);
  assert.doesNotMatch(client, /X-ScholarBuddy-Language/);
});
