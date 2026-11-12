import { closeAllDbs } from "./core/db.js";
import { resolveAzkSettings } from "./core/host-sync.js";
import { searchTool } from "./tools/search.js";
import { getTool } from "./tools/get.js";
import { createTool } from "./tools/create.js";
import { updateTool } from "./tools/update.js";
import { deleteTool } from "./tools/delete.js";
import { linkTool } from "./tools/link.js";
import { reindexTool } from "./tools/reindex.js";
import { registerAzkCommands } from "./commands/azk-command.js";

/** @param {import("@earendil-works/pi-coding-agent").ExtensionAPI} pi */
export default function azkExtension(pi) {
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
    /** @type {{ host?: string, model?: string } | undefined} */
    let sessionConfig;
    try {
      const branchEntries = ctx.sessionManager.getBranch();
      for (const entry of branchEntries) {
        if (entry.type === "custom" && entry.customType === "azk-config") {
          const data = entry.data;
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
