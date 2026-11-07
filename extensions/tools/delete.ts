import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { deleteAzk } from "../core/db.ts";
import { deleteNoteFile, readNote } from "../core/fs.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";

export const deleteTool: ToolDefinition = {
  name: "azk_delete",
  label: "Azk Delete",
  description:
    "Delete a note's markdown file, its SQLite index metadata and FTS entry, and all links referencing it in either direction.",
  promptSnippet: "Delete a note and its index/link records",
  promptGuidelines: [
    "Delete notes that are proven obsolete, incorrect, or superseded, rather than leaving contradictions in the index.",
  ],
  parameters: Type.Object({
    id: Type.String({ description: "ID of note to delete" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const { id } = params as { id: string };
    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

    const existing = await readNote(settings.notesDir, id);
    if (!existing) {
      throw new Error(`Azk note not found: ${id}`);
    }

    await deleteNoteFile(settings.notesDir, id);
    deleteAzk(settings.dbPath, id);

    const result = { id, deleted: true as const };
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
