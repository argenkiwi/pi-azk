import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  embed,
  fetchAvailableModels,
  normalizeHost,
} from "../extensions/core/embeddings.js";

/** Runs fn with a fetch that always rejects, so tests never touch the network. */
async function withFailingFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network disabled in tests"));
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("embeddings - normalizeHost handles various formats", () => {
  assert.deepEqual(normalizeHost("http://localhost:11434"), "http://localhost:11434/v1");
  assert.deepEqual(normalizeHost("http://localhost:11434/"), "http://localhost:11434/v1");
  assert.deepEqual(normalizeHost("http://localhost:11434/v1"), "http://localhost:11434/v1");
  assert.deepEqual(normalizeHost("http://192.168.1.12:11434"), "http://192.168.1.12:11434/v1");
});

test("embeddings - cosineSimilarity produces accurate math", () => {
  // Identical vectors = 1.0
  const simIdentical = cosineSimilarity([1, 0, 0], [1, 0, 0]);
  assert.deepEqual(Math.round(simIdentical * 100) / 100, 1.0);

  // Orthogonal vectors = 0.0
  const simOrtho = cosineSimilarity([1, 0, 0], [0, 1, 0]);
  assert.deepEqual(simOrtho, 0.0);

  // Opposite vectors = -1.0
  const simOpposite = cosineSimilarity([1, 0, 0], [-1, 0, 0]);
  assert.deepEqual(Math.round(simOpposite * 100) / 100, -1.0);
});

test("embeddings - embed degrades gracefully without throwing", async () => {
  // Host that is unreachable should return null, never throw
  const result = await withFailingFetch(() =>
    embed("test phrase", "embeddinggemma:latest", "http://127.0.0.1:54321/v1")
  );
  assert.deepEqual(result, null);
});

test("embeddings - fetchAvailableModels handles unreachable hosts safely", async () => {
  const models = await withFailingFetch(() => fetchAvailableModels("http://127.0.0.1:54321/v1"));
  assert.deepEqual(Array.isArray(models), true);
  assert.deepEqual(models.length, 0);
});
