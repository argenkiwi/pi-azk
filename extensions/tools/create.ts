import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createLink, upsertAzk } from "../core/db.ts";
import { embed } from "../core/embeddings.ts";
import { hashContent, writeNote } from "../core/fs.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";
import type { Note } from "../core/types.ts";

function generateTimestampId(): string {
  return new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
}

export const createTool: ToolDefinition = {
  name: "azk_create",
  label: "Azk Create",
  description:
    "Create a new atomic Zettelkasten note in notes/<id>.md and index it in the SQLite database with FTS5 and embedding vector.",
  promptSnippet: "Create an atomic note with tags, links, and markdown content",
  promptGuidelines: [
    "After non-trivial work, create an atomic note per non-obvious decision, constraint, or gotcha (roughly 3-6 sentences, linked to related notes). Never restate the git diff.",
  ],
  parameters: Type.Object({
    title: Type.String({ description: "Concise descriptive title for the note" }),
    body: Type.String({
      description:
        "Note content (roughly 3-6 sentences explaining the decision, rationale, constraints, or gotchas)",
    }),
    tags: Type.Array(Type.String(), {
      description: "Tags for categorization (e.g. ['architecture', 'gotcha', 'pi'])",
    }),
    links: Type.Optional(
      Type.Array(
        Type.Object({
          toId: Type.String({ description: "Target note ID" }),
          relation: Type.String({
            description: "Short phrase explaining why notes are connected",
          }),
        }),
        { description: "Explicit outgoing links to existing related notes" },
      ),
    ),
  }),
  execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
    const { title, body, tags, links = [] } = params as {
      title: string;
      body: string;
      tags: string[];
      links?: { toId: string; relation: string }[];
    };

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
    const id = generateTimestampId();
    const created = new Date().toISOString();
    const updated = created;

    const embedding = await embed(body, settings.model, settings.host, signal);
    const noteLinks = links.map((l) => ({ to: l.toId, relation: l.relation }));

    const note: Note = {
      id,
      title,
      tags,
      created,
      updated,
      links: noteLinks,
      body,
    };

    await writeNote(settings.notesDir, note);

    const bodyHash = await hashContent(body);
    upsertAzk(
      settings.dbPath,
      { id, title, body, tags, created, updated, bodyHash },
      embedding,
    );

    for (const link of links) {
      createLink(settings.dbPath, id, link.toId, link.relation);
    }

    const result = {
      id,
      title,
      tags,
      created,
      links,
      hasEmbedding: Boolean(embedding),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      details: {
        id,
        title,
        hasEmbedding: Boolean(embedding),
      },
    };
  },
};
