import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  extractHostFromModel,
  resolveAzkSettings,
  updateSelectedHost,
  updateSelectedModel,
} from "../extensions/core/host-sync.js";

const TEST_CWD = mkdtempSync(join(tmpdir(), "azk-ws-"));
after(() => rmSync(TEST_CWD, { recursive: true, force: true }));

test("host-sync - extractHostFromModel normalizes active model baseUrl", () => {
  const model = {
    id: "gemma-4-12b",
    name: "Gemma 4",
    provider: "ollama",
    baseUrl: "http://192.168.1.12:11434",
  };

  const host = extractHostFromModel(model);
  assert.deepEqual(host, "http://192.168.1.12:11434/v1");
});

test("host-sync - resolveAzkSettings prioritizes active model baseUrl", async () => {
  const activeModel = {
    id: "qwen3.6:27b",
    baseUrl: "http://192.168.1.50:11434/v1",
  };

  const settings = await resolveAzkSettings(TEST_CWD, activeModel);
  assert.deepEqual(settings.host, "http://192.168.1.50:11434/v1");
  assert.deepEqual(settings.hostSource, "pi-active-model");
});

test("host-sync - updateSelectedModel and updateSelectedHost persist overrides", async () => {
  await updateSelectedModel(TEST_CWD, "nomic-embed-text:latest");
  await updateSelectedHost(TEST_CWD, "http://custom-host:8000");

  const settings = await resolveAzkSettings(TEST_CWD);
  assert.deepEqual(settings.model, "nomic-embed-text:latest");
  assert.deepEqual(settings.modelSource, "pinned");
  assert.deepEqual(settings.host, "http://custom-host:8000/v1");
  assert.deepEqual(settings.hostSource, "pinned");

  // Reset pinned host
  await updateSelectedHost(TEST_CWD, undefined);
});
