import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { upsertAzk } from "../core/db.ts";
import { embed } from "../core/embeddings.ts";
import { hashContent, readNote, writeNote } from "../core/fs.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";
import type { Note } from "../core/types.ts";

export const updateTool: ToolDefinition = {
  name: "azk_update",
  label: "Azk Update",
  description:
    "Update an existing note's title, body, and/or tags. Only re-computes the embedding if the body is modified.",
  promptSnippet: "Partially update note title, body, or tags",
  promptGuidelines: [
    "If a search surfaces an existing note on the same topic, update it instead of creating a duplicate. If a note proves stale or wrong, update or delete it.",
  ],
  parameters: Type.Object({
    id: Type.String({ description: "ID of note to update" }),
    title: Type.Optional(Type.String({ description: "New note title" })),
    body: Type.Optional(Type.String({ description: "New note body text" })),
    tags: Type.Optional(Type.Array(Type.String(), { description: "Updated tags array" })),
  }),
  execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
    const { id, title, body, tags } = params as {
      id: string;
      title?: string;
      body?: string;
      tags?: string[];
    };

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
    const existing = await readNote(settings.notesDir, id);

    if (!existing) {
      throw new Error(`Azk note not found: ${id}`);
    }

    const updatedNote: Note = {
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

    const bodyHash = await hashContent(updatedNote.body);
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
      updated: true as const,
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
