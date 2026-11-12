import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** @typedef {import("./types.js").AzkConfig} AzkConfig */

export const DEFAULT_NOTES_DIR = "notes";
export const DEFAULT_DB_PATH = ".azk/azk.db";
export const CONFIG_FILE_NAME = ".azk/config.json";

export function getNotesDir(cwd, customDir) {
  return customDir ? join(cwd, customDir) : join(cwd, DEFAULT_NOTES_DIR);
}

export function getDbPath(cwd, customPath) {
  if (customPath === ":memory:") return ":memory:";
  return customPath ? join(cwd, customPath) : join(cwd, DEFAULT_DB_PATH);
}

/** @returns {Promise<AzkConfig>} */
export async function loadWorkspaceConfig(cwd) {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {string} cwd
 * @param {Partial<AzkConfig>} updates
 * @returns {Promise<AzkConfig>}
 */
export async function saveWorkspaceConfig(cwd, updates) {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  const current = await loadWorkspaceConfig(cwd);
  /** @type {AzkConfig} */
  const updated = {
    ...current,
    ...updates,
  };

  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  } catch {
    // ignore write errors if directory not writable
  }

  return updated;
}

/**
 * Updates process.env so external or subshell calls (e.g. `azk` CLI in bash)
 * share the exact same host and model.
 */
export function syncProcessEnv(host, model) {
  process.env.EMBEDDING_HOST = host;
  process.env.EMBEDDING_MODEL = model;
}
