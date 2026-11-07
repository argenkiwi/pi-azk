import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import YAML from "yaml";
import type { Note, NoteAttrs } from "./types.ts";

/**
 * Parses a Markdown file's YAML frontmatter + body into a Note.
 */
export function parseNote(raw: string): Note {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error("Invalid note format: missing YAML frontmatter delimiters (---)");
  }

  const frontMatterText = match[1];
  const body = match[2]?.trim() ?? "";
  const attrs = (YAML.parse(frontMatterText) || {}) as Partial<NoteAttrs>;

  return {
    id: String(attrs.id ?? ""),
    title: String(attrs.title ?? ""),
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    created: String(attrs.created ?? new Date().toISOString()),
    updated: String(attrs.updated ?? attrs.created ?? new Date().toISOString()),
    links: Array.isArray(attrs.links)
      ? attrs.links.map((link) => ({
          to: String(link.to ?? ""),
          relation: String(link.relation ?? ""),
        }))
      : [],
    body,
  };
}

/**
 * Serializes a Note into Markdown with YAML frontmatter.
 */
export function serializeNote(note: Note): string {
  const attrs: NoteAttrs = {
    id: note.id,
    title: note.title,
    tags: note.tags,
    created: note.created,
    updated: note.updated,
    links: note.links,
  };
  const frontMatter = YAML.stringify(attrs).trim();
  return `---\n${frontMatter}\n---\n\n${note.body}\n`;
}

/**
 * Returns the file path for a note.
 */
export function getNotePath(notesDir: string, id: string): string {
  return join(notesDir, `${id}.md`);
}

/**
 * Reads and parses a note's Markdown file by ID.
 * Returns null if file not found.
 */
export async function readNote(notesDir: string, id: string): Promise<Note | null> {
  try {
    const raw = await readFile(getNotePath(notesDir, id), "utf-8");
    return parseNote(raw);
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Serializes and writes a note to its Markdown file, creating the directory if needed.
 */
export async function writeNote(notesDir: string, note: Note): Promise<void> {
  const filePath = getNotePath(notesDir, note.id);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeNote(note), "utf-8");
}

/**
 * Deletes a note's Markdown file. No-op if file does not exist.
 */
export async function deleteNoteFile(notesDir: string, id: string): Promise<boolean> {
  try {
    await unlink(getNotePath(notesDir, id));
    return true;
  } catch (err: unknown) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/**
 * Lists the IDs of every note currently in the notes directory.
 */
export async function listNoteIds(notesDir: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    const entries = await readdir(notesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        ids.push(entry.name.slice(0, -".md".length));
      }
    }
  } catch (err: unknown) {
    if (isNotFound(err)) return [];
    throw err;
  }
  return ids;
}

/**
 * Hashes text content (SHA-256, hex-encoded) to detect body changes.
 */
export async function hashContent(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string };
  return e.code === "ENOENT" || e.name === "NotFound";
}
