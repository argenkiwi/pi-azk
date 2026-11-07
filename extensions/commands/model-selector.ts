import type { ExtensionCommandContext, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchAvailableModels, probeEmbeddingModel } from "../core/embeddings.ts";
import { resolveAzkSettings, updateSelectedModel } from "../core/host-sync.ts";

export async function openModelSelector(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
  const host = settings.host;
  const currentModel = settings.model;

  if (!ctx.hasUI) {
    console.log(`Current host: ${host}\nCurrent embedding model: ${currentModel}`);
    return;
  }

  ctx.ui.setStatus("azk", "Fetching models...");
  let availableModels = await fetchAvailableModels(host);
  ctx.ui.setStatus("azk", undefined);

  let selectedModel: string | undefined;

  if (availableModels.length > 0) {
    const options: string[] = [];
    const idByOption = new Map<string, string>();

    for (const m of availableModels) {
      const isCurrent = m.id === currentModel;
      const badge = m.isEmbeddingCandidate ? " [embed]" : "";
      const currentMark = isCurrent ? " ✓ (current)" : "";
      const label = `${m.id}${badge}${currentMark}`;
      options.push(label);
      idByOption.set(label, m.id);
    }

    const manualOption = "✎  Enter custom model name...";
    options.push(manualOption);

    const chosen = await ctx.ui.select(
      `Select Azk Embedding Model (Host: ${host})`,
      options,
    );

    if (!chosen) {
      return;
    }

    if (chosen === manualOption) {
      selectedModel = await ctx.ui.input(
        "Enter embedding model name:",
        currentModel,
      );
    } else {
      selectedModel = idByOption.get(chosen);
    }
  } else {
    // Host unreachable or no models listed
    ctx.ui.notify(
      `Could not list models from ${host}. You can enter a model name manually.`,
      "warning",
    );
    selectedModel = await ctx.ui.input(
      `Enter embedding model name for host ${host}:`,
      currentModel,
    );
  }

  if (!selectedModel || !selectedModel.trim()) {
    return;
  }

  selectedModel = selectedModel.trim();

  // Probe the model to test connectivity
  ctx.ui.setStatus("azk", `Testing ${selectedModel}...`);
  const probe = await probeEmbeddingModel(selectedModel, host);
  ctx.ui.setStatus("azk", undefined);

  // Persist to workspace config and session
  await updateSelectedModel(ctx.cwd, selectedModel);
  pi.appendEntry("azk-config", {
    host,
    model: selectedModel,
    updatedAt: new Date().toISOString(),
  });

  if (probe.ok) {
    ctx.ui.notify(
      `Azk embedding model set to: ${selectedModel} (${probe.latencyMs}ms)`,
      "info",
    );
  } else {
    ctx.ui.notify(
      `Azk model saved: ${selectedModel}. Note: Probe failed (${probe.error}). Azk will fall back to keyword search until the model is available.`,
      "warning",
    );
  }
}
