import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** @typedef {import("./types.js").AzkLink} AzkLink */
/** @typedef {import("./types.js").AzkMeta} AzkMeta */

/** @type {Map<string, DatabaseSync>} */
const connections = new Map();

/** @returns {DatabaseSync} */
export function openDb(dbPath) {
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

export function closeDb(dbPath) {
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

export function closeAllDbs() {
  for (const db of connections.values()) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  connections.clear();
}

/** @returns {AzkMeta} */
function toMeta(row) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    tags,
    created: row.created,
    updated: row.updated,
    bodyHash: row.body_hash,
    hasEmbedding: row.embedding !== null && row.embedding !== undefined,
  };
}

function serializeEmbedding(vector) {
  return new Uint8Array(new Float32Array(vector).buffer);
}

function deserializeEmbedding(blob) {
  return Array.from(
    new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4),
  );
}

/** @returns {AzkMeta | null} */
export function getAzkMeta(dbPath, id) {
  const db = openDb(dbPath);
  const row = db.prepare(`SELECT * FROM azk WHERE id = ?`).get(id);
  return row ? toMeta(row) : null;
}

/**
 * @param {string} dbPath
 * @param {{ id: string, title: string, body: string, tags: string[], created: string, updated: string, bodyHash: string }} note
 * @param {number[] | null} [embedding] undefined keeps the stored vector; null clears it
 */
export function upsertAzk(dbPath, note, embedding) {
  const db = openDb(dbPath);
  const tags = JSON.stringify(note.tags);

  const existing = db
    .prepare(`SELECT embedding FROM azk WHERE id = ?`)
    .get(note.id);

  let embeddingBlob = null;
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

export function deleteAzk(dbPath, id) {
  const db = openDb(dbPath);
  const result = db.prepare(`DELETE FROM azk WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM azk_fts WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM links WHERE from_id = ? OR to_id = ?`).run(id, id);
  return Number(result.changes) > 0;
}

/** @returns {string[]} */
export function listIndexedIds(dbPath) {
  const db = openDb(dbPath);
  const rows = db.prepare(`SELECT id FROM azk`).all();
  return rows.map((row) => row.id);
}

/** @returns {string[]} */
export function deleteOrphans(dbPath, liveIds) {
  const live = new Set(liveIds);
  const removed = [];
  for (const id of listIndexedIds(dbPath)) {
    if (!live.has(id)) {
      deleteAzk(dbPath, id);
      removed.push(id);
    }
  }
  return removed;
}

function toMatchQuery(query) {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

/** @returns {AzkMeta[]} */
export function searchAzk(dbPath, query, limit) {
  const db = openDb(dbPath);
  const matchQuery = toMatchQuery(query);
  if (!matchQuery) return [];

  const matches = db
    .prepare(
      `SELECT id FROM azk_fts WHERE azk_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(matchQuery, limit);

  const records = [];
  for (const { id } of matches) {
    const record = getAzkMeta(dbPath, id);
    if (record) records.push(record);
  }
  return records;
}

/** @returns {{ id: string, vector: number[] }[]} */
export function getAllEmbeddings(dbPath) {
  const db = openDb(dbPath);
  const rows = db
    .prepare(`SELECT id, embedding FROM azk WHERE embedding IS NOT NULL`)
    .all();

  return rows.map((row) => ({
    id: row.id,
    vector: deserializeEmbedding(row.embedding),
  }));
}

export function createLink(dbPath, fromId, toId, relation) {
  const db = openDb(dbPath);
  db.prepare(
    `INSERT INTO links (from_id, to_id, relation, created) VALUES (?, ?, ?, ?)`,
  ).run(fromId, toId, relation, new Date().toISOString());
}

/** @param {{ to: string, relation: string }[]} links */
export function replaceLinksForNote(dbPath, fromId, links) {
  const db = openDb(dbPath);
  db.prepare(`DELETE FROM links WHERE from_id = ?`).run(fromId);
  const created = new Date().toISOString();
  for (const link of links) {
    db.prepare(
      `INSERT INTO links (from_id, to_id, relation, created) VALUES (?, ?, ?, ?)`,
    ).run(fromId, link.to, link.relation, created);
  }
}

/** @returns {AzkLink[]} */
export function getLinks(dbPath, id) {
  const db = openDb(dbPath);
  const rows = db
    .prepare(
      `SELECT from_id, to_id, relation FROM links WHERE from_id = ? OR to_id = ?`,
    )
    .all(id, id);

  return rows.map((row) => ({
    fromId: row.from_id,
    toId: row.to_id,
    relation: row.relation,
  }));
}
