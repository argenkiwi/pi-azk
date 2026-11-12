import { upsertAzk } from "../core/db.js";
import { embed } from "../core/embeddings.js";
import { hashContent, readNote, writeNote } from "../core/fs.js";
import { resolveAzkSettings } from "../core/host-sync.js";

/** @typedef {import("../core/types.js").Note} Note */

/** @type {import("@earendil-works/pi-coding-agent").ToolDefinition} */
export const updateTool = {
  name: "azk_update",
  label: "Azk Update",
  description:
    "Update an existing note's title, body, and/or tags. Only re-computes the embedding if the body is modified.",
  promptSnippet: "Partially update note title, body, or tags",
  promptGuidelines: [
    "If a search surfaces an existing note on the same topic, update it instead of creating a duplicate. If a note proves stale or wrong, update or delete it.",
  ],
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID of note to update" },
      title: { type: "string", description: "New note title" },
      body: { type: "string", description: "New note body text" },
      tags: { type: "array", items: { type: "string" }, description: "Updated tags array" },
    },
    required: ["id"],
  },
  execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
    const { id, title, body, tags } = params;

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
    const existing = await readNote(settings.notesDir, id);

    if (!existing) {
      throw new Error(`Azk note not found: ${id}`);
    }

    /** @type {Note} */
    const updatedNote = {
      ...existing,
      title: title ?? existing.title,
      body: body ?? existing.body,
      tags: tags ?? existing.tags,
      updated: new Date().toISOString(),
    };

    const embedding = body !== undefined
      ? await embed(updatedNote.body, settings.model, settings.host, signal)
      : undefined;

    await writeNote(settings.notesDir, updatedNote);

    const bodyHash = hashContent(updatedNote.body);
    upsertAzk(
      settings.dbPath,
      {
        id,
        title: updatedNote.title,
        body: updatedNote.body,
        tags: updatedNote.tags,
        created: updatedNote.created,
        updated: updatedNote.updated,
        bodyHash,
      },
      embedding,
    );

    const result = {
      id,
      updated: true,
      title: updatedNote.title,
      tags: updatedNote.tags,
      reEmbedded: embedding !== undefined,
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
