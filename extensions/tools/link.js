import { createLink } from "../core/db.js";
import { readNote, writeNote } from "../core/fs.js";
import { resolveAzkSettings } from "../core/host-sync.js";

/** @typedef {import("../core/types.js").Note} Note */

/** @type {import("@earendil-works/pi-coding-agent").ToolDefinition} */
export const linkTool = {
  name: "azk_link",
  label: "Azk Link",
  description:
    "Create an explicit relational link between two existing notes. Verifies that both note IDs exist before linking.",
  promptSnippet: "Create a named link between two existing notes",
  parameters: {
    type: "object",
    properties: {
      fromId: { type: "string", description: "Source note ID" },
      toId: { type: "string", description: "Target note ID" },
      relation: { type: "string", description: "Short phrase explaining why notes are connected" },
    },
    required: ["fromId", "toId", "relation"],
  },
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const { fromId, toId, relation } = params;

    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

    const [fromNote, toNote] = await Promise.all([
      readNote(settings.notesDir, fromId),
      readNote(settings.notesDir, toId),
    ]);

    if (!fromNote || !toNote) {
      throw new Error(
        `Cannot link: one or both azk notes not found (fromId: ${fromId}, toId: ${toId})`,
      );
    }

    /** @type {Note} */
    const updatedFromNote = {
      ...fromNote,
      links: [...fromNote.links, { to: toId, relation }],
      updated: new Date().toISOString(),
    };

    await writeNote(settings.notesDir, updatedFromNote);
    createLink(settings.dbPath, fromId, toId, relation);

    const result = { fromId, toId, relation, linked: true };
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
