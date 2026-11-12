import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** @typedef {import("./types.js").Note} Note */

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter codec.
//
// Supports only the subset notes use: top-level `key: value` pairs where value
// is a scalar (plain, 'single' or "double" quoted, optionally folded over
// several lines), an inline `[a, b]` list, or a block list of scalars / flat
// `key: value` maps. Anything else (anchors, `|`/`>` block scalars, nested maps)
// is out of scope. Unknown keys are ignored on read.
// ---------------------------------------------------------------------------

const KEY_LINE = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/;

/** @param {string} raw */
function parseScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'")) return s.slice(1, s.lastIndexOf("'")).replace(/''/g, "'");
  const plain = s.replace(/\s+#.*$/, "");
  return plain === "~" || plain === "null" ? "" : plain;
}

/** Splits `a, "b, c", 'd'` on top-level commas. */
function splitFlow(inner) {
  const parts = [];
  let cur = "";
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote === '"') cur += inner[++i] ?? "";
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(parseScalar);
}

/** Parses `key: value` inside a block-list item. Returns null if not a map entry. */
function parseMapEntry(text) {
  if (/^["']/.test(text)) return null;
  const m = text.match(/^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/);
  return m ? [m[1], parseScalar(m[2] ?? "")] : null;
}

/** @param {string[]} lines */
function parseBlockList(lines) {
  const items = [];
  for (const line of lines) {
    const item = line.match(/^\s*-(?:[ \t]+(.*))?$/);
    if (item) {
      const text = (item[1] ?? "").trim();
      const entry = parseMapEntry(text);
      items.push(entry ? { [entry[0]]: entry[1] } : parseScalar(text));
    } else if (items.length && typeof items.at(-1) === "object") {
      const entry = parseMapEntry(line.trim());
      if (entry) items.at(-1)[entry[0]] = entry[1];
    }
  }
  return items;
}

/**
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseFrontmatter(text) {
  const lines = text.split("\n");
  /** @type {Record<string, unknown>} */
  const out = {};
  for (let i = 0; i < lines.length; ) {
    const m = lines[i].match(KEY_LINE);
    if (!m) {
      i++;
      continue;
    }
    const [, key, inline] = m;
    const block = [];
    for (i++; i < lines.length && (/^\s/.test(lines[i]) || /^-(\s|$)/.test(lines[i])); i++) {
      block.push(lines[i]);
    }
    if (inline === undefined || inline.trim() === "") {
      out[key] = block.length ? parseBlockList(block) : "";
    } else if (inline.trim().startsWith("[")) {
      const joined = [inline, ...block.map((l) => l.trim())].join(" ").trim();
      out[key] = splitFlow(joined.replace(/^\[/, "").replace(/\]\s*$/, ""));
    } else {
      // Scalar, possibly folded across continuation lines.
      out[key] = parseScalar([inline, ...block.map((l) => l.trim())].join(" "));
    }
  }
  return out;
}

const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

/** Plain when unambiguous, otherwise a JSON string (valid YAML double-quoted). */
function formatScalar(value) {
  const s = String(value);
  const plain = /^[A-Za-z0-9][A-Za-z0-9 _./()-]*$/.test(s) && !/\s$/.test(s) &&
    !RESERVED.test(s) && !/^[\d.]+(e[+-]?\d+)?$/i.test(s);
  return plain ? s : JSON.stringify(s);
}

/**
 * @param {{ id: string; title: string; tags: string[]; created: string; updated: string; links: { to: string; relation: string }[] }} attrs
 */
export function serializeFrontmatter(attrs) {
  const lines = [`id: ${formatScalar(attrs.id)}`, `title: ${formatScalar(attrs.title)}`];
  lines.push(attrs.tags.length ? "tags:" : "tags: []");
  for (const tag of attrs.tags) lines.push(`- ${formatScalar(tag)}`);
  lines.push(`created: ${formatScalar(attrs.created)}`, `updated: ${formatScalar(attrs.updated)}`);
  lines.push(attrs.links.length ? "links:" : "links: []");
  for (const link of attrs.links) {
    lines.push(`- to: ${formatScalar(link.to)}`, `  relation: ${formatScalar(link.relation)}`);
  }
  return lines.join("\n");
}

/**
 * Parses a Markdown file's YAML frontmatter + body into a Note.
 * @param {string} raw
 * @returns {Note}
 */
export function parseNote(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid note format: missing YAML frontmatter delimiters (---)");
  }

  const attrs = parseFrontmatter(match[1]);
  const now = new Date().toISOString();
  const created = String(attrs.created || now);

  return {
    id: String(attrs.id ?? ""),
    title: String(attrs.title ?? ""),
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    created,
    updated: String(attrs.updated || created),
    links: Array.isArray(attrs.links)
      ? attrs.links.map((link) => ({
        to: String(link?.to ?? ""),
        relation: String(link?.relation ?? ""),
      }))
      : [],
    body: match[2]?.trim() ?? "",
  };
}

/**
 * Serializes a Note into Markdown with YAML frontmatter.
 * @param {Note} note
 */
export function serializeNote(note) {
  return `---\n${serializeFrontmatter(note)}\n---\n\n${note.body}\n`;
}

/** Returns the file path for a note. */
export function getNotePath(notesDir, id) {
  return join(notesDir, `${id}.md`);
}

/**
 * Reads and parses a note's Markdown file by ID. Returns null if not found.
 * @returns {Promise<Note | null>}
 */
export async function readNote(notesDir, id) {
  try {
    return parseNote(await readFile(getNotePath(notesDir, id), "utf-8"));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Serializes and writes a note, creating the directory if needed. */
export async function writeNote(notesDir, note) {
  const filePath = getNotePath(notesDir, note.id);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeNote(note), "utf-8");
}

/** Deletes a note's Markdown file. Returns false if it did not exist. */
export async function deleteNoteFile(notesDir, id) {
  try {
    await unlink(getNotePath(notesDir, id));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/**
 * Lists the IDs of every note currently in the notes directory.
 * @returns {Promise<string[]>}
 */
export async function listNoteIds(notesDir) {
  try {
    const entries = await readdir(notesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name.slice(0, -".md".length));
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/** Hashes text (SHA-256, hex) to detect body changes. */
export function hashContent(text) {
  return createHash("sha256").update(text).digest("hex");
}

function isNotFound(err) {
  return Boolean(err && typeof err === "object" && err.code === "ENOENT");
}
