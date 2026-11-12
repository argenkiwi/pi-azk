/** @typedef {import("./types.js").EmbeddingModelInfo} EmbeddingModelInfo */

export const DEFAULT_EMBEDDING_HOST = "http://localhost:11434/v1";
export const DEFAULT_EMBEDDING_MODEL = "embeddinggemma:latest";

/**
 * Normalizes host URL to ensure proper base for OpenAI-compatible embeddings.
 * E.g. "http://localhost:11434" -> "http://localhost:11434/v1"
 */
export function normalizeHost(host) {
  let trimmed = host.trim().replace(/\/+$/, "");
  if (!trimmed.endsWith("/v1") && !trimmed.endsWith("/v1/")) {
    trimmed = `${trimmed}/v1`;
  }
  return trimmed;
}

/**
 * Embeds text using an OpenAI-compatible /embeddings endpoint.
 * Never throws — returns null on error to gracefully fall back to keyword search.
 */
/** @returns {Promise<number[] | null>} */
export async function embed(text, model, host, signal) {
  try {
    const normalizedHost = normalizeHost(host);
    const response = await fetch(`${normalizedHost}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
      signal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    return Array.isArray(vector) ? vector : null;
  } catch {
    return null;
  }
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const EMBEDDING_KEYWORDS = [
  "embed",
  "embedding",
  "bge",
  "gte",
  "minilm",
  "nomic",
  "e5",
  "bert",
  "text-similarity",
];

function isLikelyEmbeddingModel(id) {
  const lower = id.toLowerCase();
  return EMBEDDING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Fetches available models from the host.
 * Checks OpenAI-compatible /v1/models and Ollama's /api/tags.
 */
/** @returns {Promise<EmbeddingModelInfo[]>} */
export async function fetchAvailableModels(host) {
  const normalizedHost = normalizeHost(host);
  /** @type {Map<string, EmbeddingModelInfo>} */
  const modelsMap = new Map();

  // 1. Try OpenAI-compatible /models endpoint
  try {
    const res = await fetch(`${normalizedHost}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      for (const item of list) {
        const id = item?.id || item?.name;
        if (id && typeof id === "string") {
          modelsMap.set(id, {
            id,
            name: item.name || id,
            isEmbeddingCandidate: isLikelyEmbeddingModel(id),
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Try Ollama origin /api/tags
  try {
    const url = new URL(normalizedHost);
    const ollamaTagsUrl = `${url.origin}/api/tags`;
    const res = await fetch(ollamaTagsUrl, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.models) ? data.models : [];
      for (const item of list) {
        const id = item?.name || item?.model;
        if (id && typeof id === "string" && !modelsMap.has(id)) {
          modelsMap.set(id, {
            id,
            name: id,
            isEmbeddingCandidate: isLikelyEmbeddingModel(id),
          });
        }
      }
    }
  } catch {
    // ignore
  }

  const results = Array.from(modelsMap.values());
  // Sort: embedding candidates first, then alphabetical
  results.sort((a, b) => {
    if (a.isEmbeddingCandidate && !b.isEmbeddingCandidate) return -1;
    if (!a.isEmbeddingCandidate && b.isEmbeddingCandidate) return 1;
    return a.id.localeCompare(b.id);
  });

  return results;
}

/**
 * Probes an embedding model by sending a short text embedding request.
 */
/** @returns {Promise<{ ok: boolean, error?: string, latencyMs?: number }>} */
export async function probeEmbeddingModel(model, host) {
  const start = Date.now();
  try {
    const normalizedHost = normalizeHost(host);
    const response = await fetch(`${normalizedHost}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: "probe" }),
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${response.status}: ${text.slice(0, 100) || response.statusText}`,
        latencyMs,
      };
    }

    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    if (Array.isArray(vector) && vector.length > 0) {
      return { ok: true, latencyMs };
    }

    return {
      ok: false,
      error: "Response did not contain an embedding vector array",
      latencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      latencyMs: Date.now() - start,
    };
  }
}
