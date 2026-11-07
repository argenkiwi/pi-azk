import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AzkConfig } from "./types.ts";

export const DEFAULT_NOTES_DIR = "notes";
export const DEFAULT_DB_PATH = ".azk/azk.db";
export const CONFIG_FILE_NAME = ".azk/config.json";

export function getNotesDir(cwd: string, customDir?: string): string {
  return customDir ? join(cwd, customDir) : join(cwd, DEFAULT_NOTES_DIR);
}

export function getDbPath(cwd: string, customPath?: string): string {
  if (customPath === ":memory:") return ":memory:";
  return customPath ? join(cwd, customPath) : join(cwd, DEFAULT_DB_PATH);
}

export async function loadWorkspaceConfig(cwd: string): Promise<AzkConfig> {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as AzkConfig;
  } catch {
    return {};
  }
}

export async function saveWorkspaceConfig(
  cwd: string,
  updates: Partial<AzkConfig>,
): Promise<AzkConfig> {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  const current = await loadWorkspaceConfig(cwd);
  const updated: AzkConfig = {
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
export function syncProcessEnv(host: string, model: string): void {
  try {
    if (typeof process !== "undefined" && process.env) {
      process.env.EMBEDDING_HOST = host;
      process.env.EMBEDDING_MODEL = model;
    }
    // Also set Deno env if running under Deno
    if (typeof (globalThis as unknown as { Deno?: { env: { set: (k: string, v: string) => void } } }).Deno?.env?.set === "function") {
      (globalThis as unknown as { Deno: { env: { set: (k: string, v: string) => void } } }).Deno.env.set("EMBEDDING_HOST", host);
      (globalThis as unknown as { Deno: { env: { set: (k: string, v: string) => void } } }).Deno.env.set("EMBEDDING_MODEL", model);
    }
  } catch {
    // ignore env set permission issues
  }
}
