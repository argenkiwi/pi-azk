import { assertEquals } from "@std/assert";
import {
  cosineSimilarity,
  embed,
  fetchAvailableModels,
  normalizeHost,
} from "../extensions/core/embeddings.ts";

Deno.test("embeddings - normalizeHost handles various formats", () => {
  assertEquals(normalizeHost("http://localhost:11434"), "http://localhost:11434/v1");
  assertEquals(normalizeHost("http://localhost:11434/"), "http://localhost:11434/v1");
  assertEquals(normalizeHost("http://localhost:11434/v1"), "http://localhost:11434/v1");
  assertEquals(normalizeHost("http://192.168.1.12:11434"), "http://192.168.1.12:11434/v1");
});

Deno.test("embeddings - cosineSimilarity produces accurate math", () => {
  // Identical vectors = 1.0
  const simIdentical = cosineSimilarity([1, 0, 0], [1, 0, 0]);
  assertEquals(Math.round(simIdentical * 100) / 100, 1.0);

  // Orthogonal vectors = 0.0
  const simOrtho = cosineSimilarity([1, 0, 0], [0, 1, 0]);
  assertEquals(simOrtho, 0.0);

  // Opposite vectors = -1.0
  const simOpposite = cosineSimilarity([1, 0, 0], [-1, 0, 0]);
  assertEquals(Math.round(simOpposite * 100) / 100, -1.0);
});

Deno.test("embeddings - embed degrades gracefully without throwing", async () => {
  // Host that is unreachable should return null, never throw
  const result = await embed(
    "test phrase",
    "embeddinggemma:latest",
    "http://127.0.0.1:54321/v1",
  );
  assertEquals(result, null);
});

Deno.test("embeddings - fetchAvailableModels handles unreachable hosts safely", async () => {
  const models = await fetchAvailableModels("http://127.0.0.1:54321/v1");
  assertEquals(Array.isArray(models), true);
  assertEquals(models.length, 0);
});
