import { DEFAULT_EMBEDDING_HOST, DEFAULT_EMBEDDING_MODEL, normalizeHost } from "./embeddings.js";
import { getDbPath, getNotesDir, loadWorkspaceConfig, saveWorkspaceConfig, syncProcessEnv } from "./config.js";

/** @typedef {import("./types.js").AzkConfig} AzkConfig */
/** @typedef {import("@earendil-works/pi-ai").Model<any>} PiModel */
/**
 * @typedef {object} ResolvedAzkSettings
 * @property {string} host
 * @property {string} model
 * @property {string} notesDir
 * @property {string} dbPath
 * @property {"pinned" | "pi-active-model" | "env" | "default"} hostSource
 * @property {"pinned" | "env" | "default"} modelSource
 */

/**
 * Extracts a normalized OpenAI-compatible API base URL from a model or provider URL.
 */
/** @param {PiModel} [model] @returns {string | null} */
export function extractHostFromModel(model) {
  if (!model || !model.baseUrl) return null;
  return normalizeHost(model.baseUrl);
}

/**
 * Resolves current effective azk settings based on project configuration,
 * Pi's active model, environment variables, and defaults.
 */
/**
 * @param {string} cwd
 * @param {PiModel} [activeModel]
 * @param {Partial<AzkConfig>} [sessionOverride]
 * @returns {Promise<ResolvedAzkSettings>}
 */
export async function resolveAzkSettings(cwd, activeModel, sessionOverride) {
  const diskConfig = await loadWorkspaceConfig(cwd);
  const config = {
    ...diskConfig,
    ...sessionOverride,
  };

  /** @type {string} */
  let host;
  /** @type {ResolvedAzkSettings["hostSource"]} */
  let hostSource;

  if (config.host) {
    host = normalizeHost(config.host);
    hostSource = "pinned";
  } else {
    const modelHost = extractHostFromModel(activeModel);
    if (modelHost) {
      host = modelHost;
      hostSource = "pi-active-model";
    } else if (process.env.EMBEDDING_HOST) {
      host = normalizeHost(process.env.EMBEDDING_HOST);
      hostSource = "env";
    } else {
      host = DEFAULT_EMBEDDING_HOST;
      hostSource = "default";
    }
  }

  /** @type {string} */
  let model;
  /** @type {ResolvedAzkSettings["modelSource"]} */
  let modelSource;

  if (config.model) {
    model = config.model;
    modelSource = "pinned";
  } else if (process.env.EMBEDDING_MODEL) {
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
/** @returns {Promise<AzkConfig>} */
export async function updateSelectedModel(cwd, model) {
  const updated = await saveWorkspaceConfig(cwd, { model });
  process.env.EMBEDDING_MODEL = model;
  return updated;
}

/**
 * Persists an updated embedding host override to workspace config and environment.
 */
/** @returns {Promise<AzkConfig>} */
export async function updateSelectedHost(cwd, host) {
  const normalized = host ? normalizeHost(host) : undefined;
  const updated = await saveWorkspaceConfig(cwd, { host: normalized });
  if (normalized) {
    process.env.EMBEDDING_HOST = normalized;
  }
  return updated;
}
