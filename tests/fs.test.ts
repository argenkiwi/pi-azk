import { assertEquals, assertNotEquals } from "@std/assert";
import {
  deleteNoteFile,
  hashContent,
  listNoteIds,
  parseNote,
  readNote,
  serializeNote,
  writeNote,
} from "../extensions/core/fs.ts";
import type { Note } from "../extensions/core/types.ts";

const TEST_DIR = "./tests/.tmp_notes";

Deno.test("fs - note parsing and serialization roundtrip", () => {
  const note: Note = {
    id: "20260901120000",
    title: "Roundtrip Test Note",
    tags: ["test", "roundtrip"],
    created: "2026-09-01T12:00:00Z",
    updated: "2026-09-01T12:00:00Z",
    links: [{ to: "20260901110000", relation: "relates to" }],
    body: "First line of content.\nSecond line of content.",
  };

  const serialized = serializeNote(note);
  const parsed = parseNote(serialized);

  assertEquals(parsed.id, note.id);
  assertEquals(parsed.title, note.title);
  assertEquals(parsed.tags, note.tags);
  assertEquals(parsed.created, note.created);
  assertEquals(parsed.links, note.links);
  assertEquals(parsed.body, note.body);
});

Deno.test("fs - file operations (write, read, list, delete)", async () => {
  const note: Note = {
    id: "20260901999999",
    title: "Temporary Disk Note",
    tags: ["disk"],
    created: "2026-09-01T12:00:00Z",
    updated: "2026-09-01T12:00:00Z",
    links: [],
    body: "Disk body text.",
  };

  await writeNote(TEST_DIR, note);

  const readBack = await readNote(TEST_DIR, note.id);
  assertNotEquals(readBack, null);
  assertEquals(readBack?.id, note.id);
  assertEquals(readBack?.title, note.title);

  const ids = await listNoteIds(TEST_DIR);
  assertEquals(ids.includes(note.id), true);

  const deleted = await deleteNoteFile(TEST_DIR, note.id);
  assertEquals(deleted, true);

  const missing = await readNote(TEST_DIR, note.id);
  assertEquals(missing, null);
});

Deno.test("fs - hashContent produces deterministic SHA-256", async () => {
  const hash1 = await hashContent("test content");
  const hash2 = await hashContent("test content");
  const hash3 = await hashContent("different content");

  assertEquals(hash1, hash2);
  assertNotEquals(hash1, hash3);
  assertEquals(hash1.length, 64);
});
