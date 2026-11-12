import { getLinks } from "../core/db.js";
import { readNote } from "../core/fs.js";
import { resolveAzkSettings } from "../core/host-sync.js";

/** @type {import("@earendil-works/pi-coding-agent").ToolDefinition} */
export const getTool = {
  name: "azk_get",
  label: "Azk Get",
  description:
    "Retrieve a Zettelkasten note by its unique timestamp ID, including frontmatter metadata, body text, and bidirectional links.",
  promptSnippet: "Get note contents and connected links by ID",
  promptGuidelines: [
    "Use azk_get to read 1-3 relevant notes found by azk_search before starting work on a task.",
  ],
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique ID of the note to retrieve (e.g. '20260903042130')" },
    },
    required: ["id"],
  },
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const { id } = params;
    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

    const note = await readNote(settings.notesDir, id);
    if (!note) {
      throw new Error(`Azk note not found: ${id}`);
    }

    const links = getLinks(settings.dbPath, id);
    const result = {
      ...note,
      links,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      details: {
        id: note.id,
        title: note.title,
        linkCount: links.length,
      },
    };
  },
};
