import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { closeAllDbs } from "./core/db.ts";
import { resolveAzkSettings } from "./core/host-sync.ts";
import { searchTool } from "./tools/search.ts";
import { getTool } from "./tools/get.ts";
import { createTool } from "./tools/create.ts";
import { updateTool } from "./tools/update.ts";
import { deleteTool } from "./tools/delete.ts";
import { linkTool } from "./tools/link.ts";
import { reindexTool } from "./tools/reindex.ts";
import { registerAzkCommands } from "./commands/azk-command.ts";

export default function azkExtension(pi: ExtensionAPI): void {
  // 1. Register LLM Custom Tools
  pi.registerTool(searchTool);
  pi.registerTool(getTool);
  pi.registerTool(createTool);
  pi.registerTool(updateTool);
  pi.registerTool(deleteTool);
  pi.registerTool(linkTool);
  pi.registerTool(reindexTool);

  // 2. Register Slash Commands (/azk, /azk-model)
  registerAzkCommands(pi);

  // 3. Lifecycle Hooks: Keep host in sync with Pi's active model
  pi.on("session_start", async (_event, ctx) => {
    // Check branch entries for any session-stored azk-config
    let sessionConfig: { host?: string; model?: string } | undefined;
    try {
      const branchEntries = ctx.sessionManager.getBranch();
      for (const entry of branchEntries) {
        if (entry.type === "custom" && entry.customType === "azk-config") {
          const data = entry.data as { host?: string; model?: string } | undefined;
          if (data) {
            sessionConfig = data;
          }
        }
      }
    } catch {
      // ignore
    }

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model, sessionConfig);
    if (ctx.hasUI) {
      ctx.ui.setStatus("azk", `azk: ${settings.model}`);
    }
  });

  pi.on("model_select", async (event, ctx) => {
    // Automatically adjust azk host if tracking Pi's active model
    const settings = await resolveAzkSettings(ctx.cwd, event.model);
    if (ctx.hasUI) {
      ctx.ui.setStatus("azk", `azk: ${settings.model}`);
    }
  });

  pi.on("session_shutdown", async () => {
    closeAllDbs();
  });
}
