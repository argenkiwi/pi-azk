import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  deleteNoteFile,
  hashContent,
  listNoteIds,
  parseFrontmatter,
  parseNote,
  readNote,
  serializeNote,
  writeNote,
} from "../extensions/core/fs.js";

const TEST_DIR = mkdtempSync(join(tmpdir(), "azk-notes-"));
after(() => rmSync(TEST_DIR, { recursive: true, force: true }));

test("fs - note parsing and serialization roundtrip", () => {
  const note = {
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

  assert.deepEqual(parsed.id, note.id);
  assert.deepEqual(parsed.title, note.title);
  assert.deepEqual(parsed.tags, note.tags);
  assert.deepEqual(parsed.created, note.created);
  assert.deepEqual(parsed.links, note.links);
  assert.deepEqual(parsed.body, note.body);
});

test("fs - file operations (write, read, list, delete)", async () => {
  const note = {
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
  assert.notDeepEqual(readBack, null);
  assert.deepEqual(readBack?.id, note.id);
  assert.deepEqual(readBack?.title, note.title);

  const ids = await listNoteIds(TEST_DIR);
  assert.deepEqual(ids.includes(note.id), true);

  const deleted = await deleteNoteFile(TEST_DIR, note.id);
  assert.deepEqual(deleted, true);

  const missing = await readNote(TEST_DIR, note.id);
  assert.deepEqual(missing, null);
});

test("fs - hashContent produces deterministic SHA-256", () => {
  const hash1 = hashContent("test content");
  const hash2 = hashContent("test content");
  const hash3 = hashContent("different content");

  assert.deepEqual(hash1, hash2);
  assert.notDeepEqual(hash1, hash3);
  assert.deepEqual(hash1.length, 64);
});

test("fs - parses notes written by the yaml library (quoted scalars, [] lists)", () => {
  const raw = readFileSync(new URL("../notes/20261107190244739b69a.md", import.meta.url), "utf-8");
  const note = parseNote(raw);
  assert.equal(note.id, "20261107190244739b69a");
  assert.equal(note.title, "Pi Coding Agent Extension Host Sharing and Embedding Fallback");
  assert.deepEqual(note.tags, ["pi-agent", "azk", "embeddings", "architecture", "gotcha"]);
  assert.equal(note.created, "2026-11-07T19:02:44.739Z");
  assert.deepEqual(note.links, []);
  assert.match(note.body, /^Azk extension in Pi/);
});

test("fs - frontmatter handles flow lists, folded scalars and comments", () => {
  const fm = parseFrontmatter([
    "id: 20260901120000",
    "title: A long title that was folded",
    "  onto a second line",
    "tags: [a, 'b, c', \"d\"]",
    "created: '2026-09-01T12:00:00Z' # comment",
    "links:",
    "  - to: n1",
    "    relation: \"depends on: x\"",
    "unknown: ignored",
  ].join("\n"));
  assert.equal(fm.id, "20260901120000");
  assert.equal(fm.title, "A long title that was folded onto a second line");
  assert.deepEqual(fm.tags, ["a", "b, c", "d"]);
  assert.equal(fm.created, "2026-09-01T12:00:00Z");
  assert.deepEqual(fm.links, [{ to: "n1", relation: "depends on: x" }]);
});

test("fs - roundtrip preserves tricky strings", () => {
  const note = {
    id: "20260901120000",
    title: 'Colons: "quotes", #hash & \'apostrophes\' — unicode',
    tags: ["true", "123", "with space", "a: b", ""],
    created: "2026-09-01T12:00:00.000Z",
    updated: "2026-09-01T12:00:00.000Z",
    links: [{ to: "20260901110000", relation: "it's: complicated" }],
    body: "Body text.",
  };
  assert.deepEqual(parseNote(serializeNote(note)), note);
});
