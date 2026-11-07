import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createLink } from "../core/db.ts";
import { readNote, writeNote } from "../core/fs.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";
import type { Note } from "../core/types.ts";

export const linkTool: ToolDefinition = {
  name: "azk_link",
  label: "Azk Link",
  description:
    "Create an explicit relational link between two existing notes. Verifies that both note IDs exist before linking.",
  promptSnippet: "Create a named link between two existing notes",
  parameters: Type.Object({
    fromId: Type.String({ description: "Source note ID" }),
    toId: Type.String({ description: "Target note ID" }),
    relation: Type.String({ description: "Short phrase explaining why notes are connected" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const { fromId, toId, relation } = params as {
      fromId: string;
      toId: string;
      relation: string;
    };

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

    const updatedFromNote: Note = {
      ...fromNote,
      links: [...fromNote.links, { to: toId, relation }],
      updated: new Date().toISOString(),
    };

    await writeNote(settings.notesDir, updatedFromNote);
    createLink(settings.dbPath, fromId, toId, relation);

    const result = { fromId, toId, relation, linked: true as const };
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
