import type { Model } from "@earendil-works/pi-ai";
import { DEFAULT_EMBEDDING_HOST, DEFAULT_EMBEDDING_MODEL, normalizeHost } from "./embeddings.ts";
import { getDbPath, getNotesDir, loadWorkspaceConfig, saveWorkspaceConfig, syncProcessEnv } from "./config.ts";
import type { AzkConfig } from "./types.ts";

export interface ResolvedAzkSettings {
  host: string;
  model: string;
  notesDir: string;
  dbPath: string;
  hostSource: "pinned" | "pi-active-model" | "env" | "default";
  modelSource: "pinned" | "env" | "default";
}

/**
 * Extracts a normalized OpenAI-compatible API base URL from a model or provider URL.
 */
export function extractHostFromModel(model?: Model<any>): string | null {
  if (!model || !model.baseUrl) return null;
  return normalizeHost(model.baseUrl);
}

/**
 * Resolves current effective azk settings based on project configuration,
 * Pi's active model, environment variables, and defaults.
 */
export async function resolveAzkSettings(
  cwd: string,
  activeModel?: Model<any>,
  sessionOverride?: Partial<AzkConfig>,
): Promise<ResolvedAzkSettings> {
  const diskConfig = await loadWorkspaceConfig(cwd);
  const config: AzkConfig = {
    ...diskConfig,
    ...sessionOverride,
  };

  let host: string;
  let hostSource: ResolvedAzkSettings["hostSource"];

  if (config.host) {
    host = normalizeHost(config.host);
    hostSource = "pinned";
  } else {
    const modelHost = extractHostFromModel(activeModel);
    if (modelHost) {
      host = modelHost;
      hostSource = "pi-active-model";
    } else if (typeof process !== "undefined" && process.env?.EMBEDDING_HOST) {
      host = normalizeHost(process.env.EMBEDDING_HOST);
      hostSource = "env";
    } else {
      host = DEFAULT_EMBEDDING_HOST;
      hostSource = "default";
    }
  }

  let model: string;
  let modelSource: ResolvedAzkSettings["modelSource"];

  if (config.model) {
    model = config.model;
    modelSource = "pinned";
  } else if (typeof process !== "undefined" && process.env?.EMBEDDING_MODEL) {
    model = process.env.EMBEDDING_MODEL;
    modelSource = "env";
  } else {
    model = DEFAULT_EMBEDDING_MODEL;
    modelSource = "default";
  }

  const notesDir = getNotesDir(cwd, config.notesDir);
  const dbPath = getDbPath(cwd, config.dbPath);

  // Keep external tools and bash subshells in sync
  syncProcessEnv(host, model);

  return {
    host,
    model,
    notesDir,
    dbPath,
    hostSource,
    modelSource,
  };
}

/**
 * Persists an updated embedding model to workspace config and environment.
 */
export async function updateSelectedModel(cwd: string, model: string): Promise<AzkConfig> {
  const updated = await saveWorkspaceConfig(cwd, { model });
  if (typeof process !== "undefined" && process.env) {
    process.env.EMBEDDING_MODEL = model;
  }
  return updated;
}

/**
 * Persists an updated embedding host override to workspace config and environment.
 */
export async function updateSelectedHost(cwd: string, host?: string): Promise<AzkConfig> {
  const normalized = host ? normalizeHost(host) : undefined;
  const updated = await saveWorkspaceConfig(cwd, { host: normalized });
  if (normalized && typeof process !== "undefined" && process.env) {
    process.env.EMBEDDING_HOST = normalized;
  }
  return updated;
}
