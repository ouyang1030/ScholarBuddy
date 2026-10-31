import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveRecord, workbenchState } from "../bridge/records.mjs";
import { handle } from "../bridge/server.mjs";
import {
  OPERATION_QUADRANTS,
  operationQuadrant,
  operationFinished,
  sortOperations,
} from "../shared/operations.mjs";

async function withVault(work) {
  const vault = await mkdtemp(path.join(os.tmpdir(), "operations-matrix-"));
  const config = {
    OBSIDIAN_VAULT_PATH: vault,
    SCHOLARBUDDY_ORIGINS: "http://localhost:3100",
    _bridgeToken: "operations-test-token-with-at-least-32-characters",
  };
  try {
    await work(config, vault);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
}

function patch(item, quadrant) {
  return {
    id: item.id,
    version: item.version,
    contentHash: item.contentHash,
    eisenhowerQuadrant: quadrant,
  };
}

function api(config, pathname, record) {
  return handle(
    new Request(`http://127.0.0.1:32145${pathname}`, {
      method: record ? "POST" : "GET",
      headers: {
        Origin: "http://localhost:3100",
        Authorization: `Bearer ${config._bridgeToken}`,
        "Content-Type": "application/json",
      },
      ...(record ? { body: JSON.stringify({ collection: "operations", record }) } : {}),
    }),
    config,
  );
}

test("matrix raises importance upwards and urgency rightwards; unknown values remain unclassified", () => {
  assert.deepEqual(OPERATION_QUADRANTS, ["schedule", "do", "defer", "delegate"]);
  for (const value of [undefined, null, "", "future", 2, {}, ["do"]])
    assert.equal(operationQuadrant(value), "");
  for (const value of OPERATION_QUADRANTS) assert.equal(operationQuadrant(value), value);
  for (const status of ["Done", "done", "Archived", "Completed", "Resolved"])
    assert.equal(operationFinished({ status }), true);
  for (const status of [undefined, "Planned", "In progress", "Blocked"])
    assert.equal(operationFinished({ status }), false);
});

test("operations sort by deadline, then updated time and id, without moving completed records ahead", () => {
  const items = [
    { id: "no-date", createdAt: "2026-10-31" },
    { id: "done", status: "Done", dueDate: "2026-01-01" },
    { id: "b", dueDate: "2026-11-01", updatedAt: "2026-10-20" },
    { id: "a", dueDate: "2026-11-01", updatedAt: "2026-10-20" },
    { id: "newer", dueDate: "2026-11-01", updatedAt: "2026-10-22" },
    { id: "earliest", dueDate: "2026-10-31" },
  ];
  assert.deepEqual(
    sortOperations(items).map((x) => x.id),
    ["earliest", "newer", "a", "b", "no-date", "done"],
  );
  assert.equal(items[0].id, "no-date");
});

test("API moves repeatedly, preserves operation details, reloads and clears classification", () =>
  withVault(async (config, vault) => {
    const created = await api(config, "/workbench/record", {
      title: "Prepare a talk",
      description: "Keep these notes.",
      status: "In progress",
      progress: 45,
      dueDate: "2026-11-12",
      type: "Conference",
      projectId: "PRJ-test",
      manuscriptId: "MS-test",
    });
    assert.equal(created.status, 201);
    let item = (await created.json()).record;
    assert.equal(operationQuadrant(item.eisenhowerQuadrant), "");
    for (const quadrant of ["do", "schedule", "delegate", "defer", "do", ""]) {
      const response = await api(config, "/workbench/record", patch(item, quadrant));
      assert.equal(response.status, 200);
      item = (await response.json()).record;
      const loaded = (await (await api(config, "/workbench/state")).json()).operations[0];
      assert.equal(loaded.eisenhowerQuadrant, quadrant);
      for (const [key, value] of Object.entries({
        title: "Prepare a talk",
        description: "Keep these notes.",
        status: "In progress",
        progress: 45,
        dueDate: "2026-11-12",
        type: "Conference",
        projectId: "PRJ-test",
        manuscriptId: "MS-test",
      }))
        assert.equal(loaded[key], value);
    }
    const note = await readFile(
      path.join(vault, "ScholarBuddy", "operations", `${item.id}.md`),
      "utf8",
    );
    assert.match(note, /eisenhowerQuadrant: ""/);
    assert.equal(item.version, 7);
  }));

test("invalid classifications and stale moves/undo never overwrite vault records", () =>
  withVault(async (config) => {
    const first = await saveRecord(config, "operations", {
      title: "Original",
      eisenhowerQuadrant: "do",
    });
    for (const value of [null, 1, true, [], {}, "important", "DO"]) {
      await assert.rejects(
        saveRecord(config, "operations", patch(first, value)),
        (error) => error.status === 422,
      );
    }
    await assert.rejects(
      saveRecord(config, "projects", { title: "Wrong collection", eisenhowerQuadrant: "do" }),
      (error) => error.status === 422,
    );
    const moved = await saveRecord(config, "operations", patch(first, "schedule"));
    await assert.rejects(
      saveRecord(config, "operations", patch(first, "delegate")),
      (error) => error.status === 409,
    );
    const edited = await saveRecord(config, "operations", { ...moved, title: "Edited elsewhere" });
    await assert.rejects(
      saveRecord(config, "operations", patch(moved, "do")),
      (error) => error.status === 409,
    );
    const [loaded] = (await workbenchState(config)).operations;
    assert.equal(loaded.title, "Edited elsewhere");
    assert.equal(loaded.eisenhowerQuadrant, "schedule");
    assert.equal(loaded.contentHash, edited.contentHash);
  }));

test("hand-edited unknown classifications stay visible and survive unrelated edits until reclassified", () =>
  withVault(async (config, vault) => {
    const first = await saveRecord(config, "operations", {
      title: "Hand-edited note",
      eisenhowerQuadrant: "do",
    });
    const file = path.join(vault, "ScholarBuddy", "operations", `${first.id}.md`);
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        'eisenhowerQuadrant: "do"',
        'eisenhowerQuadrant: "future-value"',
      ),
    );
    await assert.rejects(
      saveRecord(config, "operations", patch(first, "defer")),
      (error) => error.code === "content_conflict",
    );
    let loaded = (await workbenchState(config)).operations[0];
    assert.equal(loaded.eisenhowerQuadrant, "future-value");
    assert.equal(operationQuadrant(loaded.eisenhowerQuadrant), "");
    loaded = await saveRecord(config, "operations", { ...loaded, title: "Edited in drawer" });
    assert.equal(loaded.eisenhowerQuadrant, "future-value");
    loaded = await saveRecord(config, "operations", patch(loaded, ""));
    assert.equal(loaded.eisenhowerQuadrant, "");
  }));
