import { createLink, upsertAzk } from "../core/db.js";
import { embed } from "../core/embeddings.js";
import { hashContent, readNote, writeNote } from "../core/fs.js";
import { resolveAzkSettings } from "../core/host-sync.js";

/** @typedef {import("../core/types.js").Note} Note */

function timestampId(date) {
  return date.toISOString().replace(/[-:T.]/g, "").slice(0, 14);
}

/** IDs have one-second resolution, so step forward until the file name is free. */
async function generateUniqueId(notesDir) {
  const date = new Date();
  let id = timestampId(date);
  while (await readNote(notesDir, id)) {
    date.setSeconds(date.getSeconds() + 1);
    id = timestampId(date);
  }
  return id;
}

/** @type {import("@earendil-works/pi-coding-agent").ToolDefinition} */
export const createTool = {
  name: "azk_create",
  label: "Azk Create",
  description:
    "Create a new atomic Zettelkasten note in notes/<id>.md and index it in the SQLite database with FTS5 and embedding vector.",
  promptSnippet: "Create an atomic note with tags, links, and markdown content",
  promptGuidelines: [
    "After non-trivial work, create an atomic note per non-obvious decision, constraint, or gotcha (roughly 3-6 sentences, linked to related notes). Never restate the git diff.",
  ],
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise descriptive title for the note" },
      body: {
        type: "string",
        description:
          "Note content (roughly 3-6 sentences explaining the decision, rationale, constraints, or gotchas)",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization (e.g. ['architecture', 'gotcha', 'pi'])",
      },
      links: {
        type: "array",
        description: "Explicit outgoing links to existing related notes",
        items: {
          type: "object",
          properties: {
            toId: { type: "string", description: "Target note ID" },
            relation: { type: "string", description: "Short phrase explaining why notes are connected" },
          },
          required: ["toId", "relation"],
        },
      },
    },
    required: ["title", "body", "tags"],
  },
  execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
    const { title, body, tags, links = [] } = params;

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);
    const id = await generateUniqueId(settings.notesDir);
    const created = new Date().toISOString();
    const updated = created;

    const embedding = await embed(body, settings.model, settings.host, signal);
    const noteLinks = links.map((l) => ({ to: l.toId, relation: l.relation }));

    /** @type {Note} */
    const note = {
      id,
      title,
      tags,
      created,
      updated,
      links: noteLinks,
      body,
    };

    await writeNote(settings.notesDir, note);

    const bodyHash = hashContent(body);
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
