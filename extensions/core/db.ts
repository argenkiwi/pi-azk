import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AzkLink, AzkMeta } from "./types.ts";

const connections = new Map<string, DatabaseSync>();

export function openDb(dbPath: string): DatabaseSync {
  let db = connections.get(dbPath);
  if (!db) {
    if (dbPath !== ":memory:") {
      const dir = dirname(dbPath);
      if (dir && dir !== ".") {
        mkdirSync(dir, { recursive: true });
      }
    }
    db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS azk (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        body_hash TEXT NOT NULL,
        embedding BLOB
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS azk_fts USING fts5(
        id UNINDEXED, title, body, tags
      );
      CREATE TABLE IF NOT EXISTS links (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created TEXT NOT NULL
      );
    `);
    connections.set(dbPath, db);
  }
  return db;
}

export function closeDb(dbPath: string): void {
  const db = connections.get(dbPath);
  if (db) {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
    connections.delete(dbPath);
  }
}

export function closeAllDbs(): void {
  for (const [path, db] of connections.entries()) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  connections.clear();
}

function toMeta(row: Record<string, unknown>): AzkMeta {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags as string);
  } catch {
    tags = [];
  }
  return {
    id: row.id as string,
    title: row.title as string,
    tags,
    created: row.created as string,
    updated: row.updated as string,
    bodyHash: row.body_hash as string,
    hasEmbedding: row.embedding !== null && row.embedding !== undefined,
  };
}

function serializeEmbedding(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}

function deserializeEmbedding(blob: Uint8Array): number[] {
  return Array.from(
    new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4),
  );
}

export function getAzkMeta(dbPath: string, id: string): AzkMeta | null {
  const db = openDb(dbPath);
  const row = db.prepare(`SELECT * FROM azk WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toMeta(row) : null;
}

export function upsertAzk(
  dbPath: string,
  note: {
    id: string;
    title: string;
    body: string;
    tags: string[];
    created: string;
    updated: string;
    bodyHash: string;
  },
  embedding?: number[] | null,
): void {
  const db = openDb(dbPath);
  const tags = JSON.stringify(note.tags);

  const existing = db
    .prepare(`SELECT embedding FROM azk WHERE id = ?`)
    .get(note.id) as { embedding: Uint8Array | null } | undefined;

  let embeddingBlob: Uint8Array | null = null;
  if (embedding !== undefined) {
    embeddingBlob = embedding ? serializeEmbedding(embedding) : null;
  } else {
    embeddingBlob = existing?.embedding ?? null;
  }

  db.prepare(
    `INSERT INTO azk (id, title, tags, created, updated, body_hash, embedding)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, tags = excluded.tags, created = excluded.created,
       updated = excluded.updated, body_hash = excluded.body_hash, embedding = excluded.embedding`,
  ).run(
    note.id,
    note.title,
    tags,
    note.created,
    note.updated,
    note.bodyHash,
    embeddingBlob,
  );

  db.prepare(`DELETE FROM azk_fts WHERE id = ?`).run(note.id);
  db.prepare(
    `INSERT INTO azk_fts (id, title, body, tags) VALUES (?, ?, ?, ?)`,
  ).run(note.id, note.title, note.body, tags);
}

export function deleteAzk(dbPath: string, id: string): boolean {
  const db = openDb(dbPath);
  const result = db.prepare(`DELETE FROM azk WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM azk_fts WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM links WHERE from_id = ? OR to_id = ?`).run(id, id);
  return Number(result.changes) > 0;
}

export function listIndexedIds(dbPath: string): string[] {
  const db = openDb(dbPath);
  const rows = db.prepare(`SELECT id FROM azk`).all() as unknown as { id: string }[];
  return rows.map((row) => row.id);
}

export function deleteOrphans(dbPath: string, liveIds: string[]): string[] {
  const live = new Set(liveIds);
  const removed: string[] = [];
  for (const id of listIndexedIds(dbPath)) {
    if (!live.has(id)) {
      deleteAzk(dbPath, id);
      removed.push(id);
    }
  }
  return removed;
}

function toMatchQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

export function searchAzk(
  dbPath: string,
  query: string,
  limit: number,
): AzkMeta[] {
  const db = openDb(dbPath);
  const matchQuery = toMatchQuery(query);
  if (!matchQuery) return [];

  const matches = db
    .prepare(
      `SELECT id FROM azk_fts WHERE azk_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(matchQuery, limit) as unknown as { id: string }[];

  const records: AzkMeta[] = [];
  for (const { id } of matches) {
    const record = getAzkMeta(dbPath, id);
    if (record) records.push(record);
  }
  return records;
}

export function getAllEmbeddings(
  dbPath: string,
): { id: string; vector: number[] }[] {
  const db = openDb(dbPath);
  const rows = db
    .prepare(`SELECT id, embedding FROM azk WHERE embedding IS NOT NULL`)
    .all() as unknown as { id: string; embedding: Uint8Array }[];

  return rows.map((row) => ({
    id: row.id,
    vector: deserializeEmbedding(row.embedding),
  }));
}

export function createLink(
  dbPath: string,
  fromId: string,
  toId: string,
  relation: string,
): void {
  const db = openDb(dbPath);
  db.prepare(
    `INSERT INTO links (from_id, to_id, relation, created) VALUES (?, ?, ?, ?)`,
  ).run(fromId, toId, relation, new Date().toISOString());
}

export function replaceLinksForNote(
  dbPath: string,
  fromId: string,
  links: { to: string; relation: string }[],
): void {
  const db = openDb(dbPath);
  db.prepare(`DELETE FROM links WHERE from_id = ?`).run(fromId);
  const created = new Date().toISOString();
  for (const link of links) {
    db.prepare(
      `INSERT INTO links (from_id, to_id, relation, created) VALUES (?, ?, ?, ?)`,
    ).run(fromId, link.to, link.relation, created);
  }
}

export function getLinks(dbPath: string, id: string): AzkLink[] {
  const db = openDb(dbPath);
  const rows = db
    .prepare(
      `SELECT from_id, to_id, relation FROM links WHERE from_id = ? OR to_id = ?`,
    )
    .all(id, id) as unknown as { from_id: string; to_id: string; relation: string }[];

  return rows.map((row) => ({
    fromId: row.from_id,
    toId: row.to_id,
    relation: row.relation,
  }));
}
