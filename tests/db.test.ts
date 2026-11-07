import { assertEquals, assertNotEquals } from "@std/assert";
import {
  closeDb,
  createLink,
  deleteAzk,
  deleteOrphans,
  getAllEmbeddings,
  getAzkMeta,
  getLinks,
  openDb,
  replaceLinksForNote,
  searchAzk,
  upsertAzk,
} from "../extensions/core/db.ts";

const TEST_DB = ":memory:";

Deno.test("db - upsert and retrieve note metadata", () => {
  openDb(TEST_DB);

  upsertAzk(
    TEST_DB,
    {
      id: "20260901120000",
      title: "Test Note",
      body: "This is a test note body for sqlite indexing.",
      tags: ["test", "sqlite"],
      created: "2026-09-01T12:00:00Z",
      updated: "2026-09-01T12:00:00Z",
      bodyHash: "abcd1234hash",
    },
    [0.1, 0.2, 0.3],
  );

  const meta = getAzkMeta(TEST_DB, "20260901120000");
  assertNotEquals(meta, null);
  assertEquals(meta?.id, "20260901120000");
  assertEquals(meta?.title, "Test Note");
  assertEquals(meta?.tags, ["test", "sqlite"]);
  assertEquals(meta?.hasEmbedding, true);

  closeDb(TEST_DB);
});

Deno.test("db - FTS5 search ranking", () => {
  openDb(TEST_DB);

  upsertAzk(
    TEST_DB,
    {
      id: "note1",
      title: "Rust Memory Safety",
      body: "Rust ownership model prevents memory leaks and data races.",
      tags: ["rust", "safety"],
      created: "2026-09-01T12:00:00Z",
      updated: "2026-09-01T12:00:00Z",
      bodyHash: "h1",
    },
    null,
  );

  upsertAzk(
    TEST_DB,
    {
      id: "note2",
      title: "Python Dynamic Typing",
      body: "Python allows rapid prototyping with flexible types.",
      tags: ["python", "types"],
      created: "2026-09-01T12:00:00Z",
      updated: "2026-09-01T12:00:00Z",
      bodyHash: "h2",
    },
    null,
  );

  const results = searchAzk(TEST_DB, "Rust ownership", 5);
  assertEquals(results.length, 1);
  assertEquals(results[0].id, "note1");

  const emptyResults = searchAzk(TEST_DB, "nonexistentqueryterm12345", 5);
  assertEquals(emptyResults.length, 0);

  closeDb(TEST_DB);
});

Deno.test("db - link graph and orphan deletion", () => {
  openDb(TEST_DB);

  upsertAzk(
    TEST_DB,
    {
      id: "note1",
      title: "Note 1",
      body: "Body 1",
      tags: [],
      created: "2026-09-01T12:00:00Z",
      updated: "2026-09-01T12:00:00Z",
      bodyHash: "h1",
    },
    null,
  );
  upsertAzk(
    TEST_DB,
    {
      id: "note2",
      title: "Note 2",
      body: "Body 2",
      tags: [],
      created: "2026-09-01T12:00:00Z",
      updated: "2026-09-01T12:00:00Z",
      bodyHash: "h2",
    },
    null,
  );

  createLink(TEST_DB, "note1", "note2", "contrasts with");
  const links = getLinks(TEST_DB, "note1");
  assertEquals(links.length, 1);
  assertEquals(links[0].fromId, "note1");
  assertEquals(links[0].toId, "note2");
  assertEquals(links[0].relation, "contrasts with");

  replaceLinksForNote(TEST_DB, "note1", [{ to: "note2", relation: "updated relation" }]);
  const updatedLinks = getLinks(TEST_DB, "note1");
  assertEquals(updatedLinks.length, 1);
  assertEquals(updatedLinks[0].relation, "updated relation");

  const removed = deleteOrphans(TEST_DB, ["note2"]);
  assertEquals(removed.includes("note1"), true);
  assertEquals(getAzkMeta(TEST_DB, "note1"), null);

  deleteAzk(TEST_DB, "note2");
  assertEquals(getAzkMeta(TEST_DB, "note2"), null);

  closeDb(TEST_DB);
});
