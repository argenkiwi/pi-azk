import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { deleteOrphans, getAzkMeta, replaceLinksForNote, upsertAzk } from "../core/db.ts";
import { embed } from "../core/embeddings.ts";
import { hashContent, listNoteIds, readNote } from "../core/fs.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";
import type { AzkReindexResult } from "../core/types.ts";

export const reindexTool: ToolDefinition = {
  name: "azk_reindex",
  label: "Azk Reindex",
  description:
    "Rebuild or synchronize the SQLite index and link graph from markdown notes on disk. Re-embeds newly added or modified notes and removes deleted orphans.",
  promptSnippet: "Rebuild index and embeddings from notes directory",
  promptGuidelines: [
    "Run azk_reindex if notes were created or edited outside the tool interface, or after a fresh clone.",
  ],
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, signal, _onUpdate, ctx) => {
    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
    const ids = await listNoteIds(settings.notesDir);

    let indexed = 0;
    let updated = 0;

    for (const id of ids) {
      if (signal?.aborted) {
        throw new Error("Reindex operation aborted");
      }

      const note = await readNote(settings.notesDir, id);
      if (!note) continue;

      const bodyHash = await hashContent(note.body);
      const existing = getAzkMeta(settings.dbPath, id);
      const changed = !existing || existing.bodyHash !== bodyHash;

      const embedding = changed
        ? await embed(note.body, settings.model, settings.host, signal)
        : undefined;

      upsertAzk(
        settings.dbPath,
        {
          id: note.id,
          title: note.title,
          body: note.body,
          tags: note.tags,
          created: note.created,
          updated: note.updated,
          bodyHash,
        },
        embedding,
      );

      replaceLinksForNote(settings.dbPath, id, note.links);

      if (!existing) indexed++;
      else if (changed) updated++;
    }

    const removed = deleteOrphans(settings.dbPath, ids).length;
    const result: AzkReindexResult = {
      indexed,
      updated,
      removed,
      total: ids.length,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      details: result,
    };
  },
};
