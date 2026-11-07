import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getAllEmbeddings, getAzkMeta, searchAzk } from "../core/db.ts";
import { cosineSimilarity, embed } from "../core/embeddings.ts";
import { resolveAzkSettings } from "../core/host-sync.ts";
import type { RankedAzk } from "../core/types.ts";

export const searchTool: ToolDefinition = {
  name: "azk_search",
  label: "Azk Search",
  description:
    "Search Zettelkasten notes using hybrid keyword matching (SQLite FTS5) and semantic vector re-ranking. Returns ranked note summaries.",
  promptSnippet: "Search Zettelkasten notes by keyword and semantic similarity",
  promptGuidelines: [
    "Before non-trivial architectural or design work, search existing notes with azk_search to retrieve prior art and project decisions.",
  ],
  parameters: Type.Object({
    query: Type.String({ description: "Search query or task summary" }),
    limit: Type.Optional(
      Type.Number({ description: "Maximum number of results to return (default: 5)" }),
    ),
  }),
  execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
    const { query, limit = 5 } = params as { query: string; limit?: number };
    const settings = await resolveAzkSettings(ctx.cwd, ctx.model);

    const keywordMatches = searchAzk(settings.dbPath, query, limit);
    const ranked = new Map<string, RankedAzk>();

    for (let i = 0; i < keywordMatches.length; i++) {
      const note = keywordMatches[i];
      const keywordScore = keywordMatches.length - i;
      ranked.set(note.id, {
        id: note.id,
        title: note.title,
        tags: note.tags,
        created: note.created,
        score: keywordScore,
        keywordScore,
        semanticScore: 0,
      });
    }

    // Additive semantic search: boosts keyword hits and surfaces non-keyword concepts
    const queryVector = await embed(query, settings.model, settings.host, signal);
    if (queryVector) {
      const allEmbeddings = getAllEmbeddings(settings.dbPath);
      const semanticMatches = allEmbeddings
        .map(({ id, vector }) => ({
          id,
          similarity: cosineSimilarity(queryVector, vector),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      for (const { id, similarity } of semanticMatches) {
        const existing = ranked.get(id);
        if (existing) {
          existing.score += similarity;
          existing.semanticScore = similarity;
        } else {
          const meta = getAzkMeta(settings.dbPath, id);
          if (meta) {
            ranked.set(id, {
              id: meta.id,
              title: meta.title,
              tags: meta.tags,
              created: meta.created,
              score: similarity,
              keywordScore: 0,
              semanticScore: similarity,
            });
          }
        }
      }
    }

    const results = Array.from(ranked.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
      details: {
        count: results.length,
        host: settings.host,
        model: settings.model,
        hasSemanticRanking: Boolean(queryVector),
      },
    };
  },
};
