import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeAllDbs } from "../extensions/core/db.js";
import assert from "node:assert/strict";
import { createTool } from "../extensions/tools/create.js";
import { getTool } from "../extensions/tools/get.js";
import { searchTool } from "../extensions/tools/search.js";
import { updateTool } from "../extensions/tools/update.js";
import { linkTool } from "../extensions/tools/link.js";
import { reindexTool } from "../extensions/tools/reindex.js";
import { deleteTool } from "../extensions/tools/delete.js";

const TEST_WORKSPACE = mkdtempSync(join(tmpdir(), "azk-tools-"));
const originalFetch = globalThis.fetch;

// Keep tests offline: embeddings fail and search falls back to FTS5 keywords.
before(() => {
  globalThis.fetch = () => Promise.reject(new Error("network disabled in tests"));
});
after(() => {
  globalThis.fetch = originalFetch;
  closeAllDbs();
  rmSync(TEST_WORKSPACE, { recursive: true, force: true });
});

// Tools only read ctx.cwd and ctx.model.
const mockContext = { cwd: TEST_WORKSPACE, model: undefined };

test("tools - full lifecycle: create, get, search, update, link, reindex, delete", async () => {
  // 1. Create Note 1
  const createRes1 = await createTool.execute(
    "1",
    {
      title: "Agent Architecture Decision",
      body: "We decided to build pi-azk as an integrated Pi extension.",
      tags: ["architecture", "pi"],
    },
    undefined,
    undefined,
    mockContext,
  );
  const note1 = JSON.parse(createRes1.content[0].type === "text" ? createRes1.content[0].text : "{}");
  assert.notDeepEqual(note1.id, undefined);
  assert.deepEqual(note1.title, "Agent Architecture Decision");

  // 2. Create Note 2
  const createRes2 = await createTool.execute(
    "2",
    {
      title: "Embedding Model Gotcha",
      body: "Always verify the host is reachable or fall back to keyword search.",
      tags: ["embeddings", "gotcha"],
    },
    undefined,
    undefined,
    mockContext,
  );
  const note2 = JSON.parse(createRes2.content[0].type === "text" ? createRes2.content[0].text : "{}");
  assert.notDeepEqual(note2.id, undefined);

  // 3. Get Note 1
  const getRes = await getTool.execute("3", { id: note1.id }, undefined, undefined, mockContext);
  const fetched = JSON.parse(getRes.content[0].type === "text" ? getRes.content[0].text : "{}");
  assert.deepEqual(fetched.id, note1.id);
  assert.deepEqual(fetched.title, "Agent Architecture Decision");

  // 4. Search Notes
  const searchRes = await searchTool.execute(
    "4",
    { query: "Architecture Decision" },
    undefined,
    undefined,
    mockContext,
  );
  const results = JSON.parse(searchRes.content[0].type === "text" ? searchRes.content[0].text : "[]");
  assert.deepEqual(results.length >= 1, true);
  assert.deepEqual(results[0].id, note1.id);

  // 5. Update Note 1
  const updateRes = await updateTool.execute(
    "5",
    {
      id: note1.id,
      title: "Updated Agent Architecture Decision",
      tags: ["architecture", "pi", "v2"],
    },
    undefined,
    undefined,
    mockContext,
  );
  const updated = JSON.parse(updateRes.content[0].type === "text" ? updateRes.content[0].text : "{}");
  assert.deepEqual(updated.updated, true);
  assert.deepEqual(updated.title, "Updated Agent Architecture Decision");

  // 6. Link Note 1 to Note 2
  const linkRes = await linkTool.execute(
    "6",
    {
      fromId: note1.id,
      toId: note2.id,
      relation: "depends on",
    },
    undefined,
    undefined,
    mockContext,
  );
  const linkData = JSON.parse(linkRes.content[0].type === "text" ? linkRes.content[0].text : "{}");
  assert.deepEqual(linkData.linked, true);

  // 7. Reindex
  const reindexRes = await reindexTool.execute("7", {}, undefined, undefined, mockContext);
  const reindexData = JSON.parse(reindexRes.content[0].type === "text" ? reindexRes.content[0].text : "{}");
  assert.deepEqual(reindexData.total >= 2, true);

  // 8. Delete both notes
  const del1 = await deleteTool.execute("8", { id: note1.id }, undefined, undefined, mockContext);
  assert.deepEqual(del1.details.deleted, true);

  const del2 = await deleteTool.execute("9", { id: note2.id }, undefined, undefined, mockContext);
  assert.deepEqual(del2.details.deleted, true);
});
