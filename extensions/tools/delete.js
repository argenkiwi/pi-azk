import { deleteAzk } from "../core/db.js";
import { deleteNoteFile, readNote } from "../core/fs.js";
import { resolveAzkSettings } from "../core/host-sync.js";

/** @type {import("@earendil-works/pi-coding-agent").ToolDefinition} */
export const deleteTool = {
  name: "azk_delete",
  label: "Azk Delete",
  description:
    "Delete a note's markdown file, its SQLite index metadata and FTS entry, and all links referencing it in either direction.",
  promptSnippet: "Delete a note and its index/link records",
  promptGuidelines: [
    "Delete notes that are proven obsolete, incorrect, or superseded, rather than leaving contradictions in the index.",
  ],
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "ID of note to delete" } },
    required: ["id"],
  },
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const { id } = params;
    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

    const existing = await readNote(settings.notesDir, id);
    if (!existing) {
      throw new Error(`Azk note not found: ${id}`);
    }

    await deleteNoteFile(settings.notesDir, id);
    deleteAzk(settings.dbPath, id);

    const result = { id, deleted: true };
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
