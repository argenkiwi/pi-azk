import type { ExtensionCommandContext, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { probeEmbeddingModel } from "../core/embeddings.ts";
import { listNoteIds } from "../core/fs.ts";
import { resolveAzkSettings, updateSelectedHost } from "../core/host-sync.ts";
import { openModelSelector } from "./model-selector.ts";
import { reindexTool } from "../tools/reindex.ts";
import { searchTool } from "../tools/search.ts";

export function registerAzkCommands(pi: ExtensionAPI): void {
  // Direct shortcut /azk-model
  pi.registerCommand("azk-model", {
    description: "Select an embedding model for azk within Pi",
    handler: async (_args, ctx) => {
      await openModelSelector(pi, ctx);
    },
  });

  // Main /azk command router
  pi.registerCommand("azk", {
    description: "Manage azk Zettelkasten notes, search, host, and embedding models",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0]?.toLowerCase();
      const rest = parts.slice(1).join(" ");

      switch (subcommand) {
        case "model": {
          await openModelSelector(pi, ctx);
          break;
        }

        case "host": {
          await handleHostCommand(pi, ctx, rest);
          break;
        }

        case "status": {
          await handleStatusCommand(ctx);
          break;
        }

        case "reindex": {
          await handleReindexCommand(ctx);
          break;
        }

        case "search": {
          await handleSearchCommand(ctx, rest);
          break;
        }

        default: {
          showHelp(ctx);
          break;
        }
      }
    },
  });
}

async function handleHostCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  targetHost?: string,
): Promise<void> {
  const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

  let newHost = targetHost?.trim();
  if (!newHost) {
    if (!ctx.hasUI) {
      console.log(`Current host: ${settings.host} (${settings.hostSource})`);
      return;
    }
    newHost = await ctx.ui.input(
      "Enter embedding host URL (leave empty to reset to Pi's active host):",
      settings.hostSource === "pinned" ? settings.host : "",
    );
  }

  if (newHost === undefined) return;

  const trimmed = newHost.trim();
  if (trimmed === "") {
    await updateSelectedHost(ctx.cwd, undefined);
    pi.appendEntry("azk-config", { host: undefined, resetHost: true });
    ctx.ui.notify("Azk host reset to auto-sync with Pi's active model.", "info");
  } else {
    await updateSelectedHost(ctx.cwd, trimmed);
    pi.appendEntry("azk-config", { host: trimmed });
    ctx.ui.notify(`Azk host pinned to: ${trimmed}`, "info");
  }
}

async function handleStatusCommand(ctx: ExtensionCommandContext): Promise<void> {
  const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
  const noteIds = await listNoteIds(settings.notesDir);

  ctx.ui.setStatus("azk", "Probing embedding endpoint...");
  const probe = await probeEmbeddingModel(settings.model, settings.host);
  ctx.ui.setStatus("azk", undefined);

  const statusLines = [
    `=== Azk Status ===`,
    `Notes Directory : ${settings.notesDir} (${noteIds.length} notes)`,
    `Database Path   : ${settings.dbPath}`,
    `Embedding Host  : ${settings.host} [${settings.hostSource}]`,
    `Embedding Model : ${settings.model} [${settings.modelSource}]`,
    `Endpoint Probe  : ${
      probe.ok
        ? `OK (${probe.latencyMs}ms latency)`
        : `Unavailable (${probe.error}) - keyword search active`
    }`,
  ];

  const output = statusLines.join("\n");
  if (ctx.hasUI) {
    ctx.ui.notify(
      `Azk: ${noteIds.length} notes | Host: ${settings.host} | Model: ${settings.model} | Probe: ${
        probe.ok ? "OK" : "Offline"
      }`,
      probe.ok ? "info" : "warning",
    );
  }
  console.log(output);
}

async function handleReindexCommand(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.setStatus("azk", "Reindexing notes...");
  try {
    const result = await reindexTool.execute("reindex", {}, undefined, undefined, ctx);
    const details = result.details as {
      indexed: number;
      updated: number;
      removed: number;
      total: number;
    };
    ctx.ui.notify(
      `Reindexed: ${details.indexed} new, ${details.updated} updated, ${details.removed} removed (${details.total} total)`,
      "info",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Reindex failed: ${message}`, "error");
  } finally {
    ctx.ui.setStatus("azk", undefined);
  }
}

async function handleSearchCommand(
  ctx: ExtensionCommandContext,
  query: string,
): Promise<void> {
  if (!query) {
    ctx.ui.notify("Usage: /azk search <query>", "warning");
    return;
  }

  ctx.ui.setStatus("azk", "Searching notes...");
  try {
    const result = await searchTool.execute(
      "search",
      { query, limit: 5 },
      undefined,
      undefined,
      ctx,
    );
    const text = result.content[0]?.type === "text" ? result.content[0].text : "[]";
    console.log(text);
    ctx.ui.notify(`Found ${result.details?.count ?? 0} notes matching "${query}"`, "info");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Search failed: ${message}`, "error");
  } finally {
    ctx.ui.setStatus("azk", undefined);
  }
}

function showHelp(ctx: ExtensionCommandContext): void {
  const helpText = [
    "Azk commands:",
    "  /azk model           Select embedding model from host",
    "  /azk host [url]      View or set embedding host (empty to sync with Pi)",
    "  /azk status          View current host, model, and database status",
    "  /azk search <query>  Search notes from the command line",
    "  /azk reindex         Rebuild SQLite index from notes directory",
    "  /azk-model           Direct shortcut to model selector",
  ].join("\n");

  if (ctx.hasUI) {
    ctx.ui.notify(
      "Azk commands: /azk model, /azk host, /azk status, /azk reindex, /azk search",
      "info",
    );
  }
  console.log(helpText);
}
