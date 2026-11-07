import { assertEquals } from "@std/assert";
import {
  extractHostFromModel,
  resolveAzkSettings,
  updateSelectedHost,
  updateSelectedModel,
} from "../extensions/core/host-sync.ts";
import type { Model } from "@earendil-works/pi-ai";

const TEST_CWD = "./tests/.tmp_workspace";

Deno.test("host-sync - extractHostFromModel normalizes active model baseUrl", () => {
  const model = {
    id: "gemma-4-12b",
    name: "Gemma 4",
    provider: "ollama",
    baseUrl: "http://192.168.1.12:11434",
  } as unknown as Model<any>;

  const host = extractHostFromModel(model);
  assertEquals(host, "http://192.168.1.12:11434/v1");
});

Deno.test("host-sync - resolveAzkSettings prioritizes active model baseUrl", async () => {
  const activeModel = {
    id: "qwen3.6:27b",
    baseUrl: "http://192.168.1.50:11434/v1",
  } as unknown as Model<any>;

  const settings = await resolveAzkSettings(TEST_CWD, activeModel);
  assertEquals(settings.host, "http://192.168.1.50:11434/v1");
  assertEquals(settings.hostSource, "pi-active-model");
});

Deno.test("host-sync - updateSelectedModel and updateSelectedHost persist overrides", async () => {
  await updateSelectedModel(TEST_CWD, "nomic-embed-text:latest");
  await updateSelectedHost(TEST_CWD, "http://custom-host:8000");

  const settings = await resolveAzkSettings(TEST_CWD);
  assertEquals(settings.model, "nomic-embed-text:latest");
  assertEquals(settings.modelSource, "pinned");
  assertEquals(settings.host, "http://custom-host:8000/v1");
  assertEquals(settings.hostSource, "pinned");

  // Reset pinned host
  await updateSelectedHost(TEST_CWD, undefined);
});
