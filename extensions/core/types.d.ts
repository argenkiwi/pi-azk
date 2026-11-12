export interface NoteLink {
  to: string;
  relation: string;
}

export interface Note {
  id: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  links: NoteLink[];
  body: string;
}

export interface NoteAttrs {
  id: string;
  title: string;
  tags?: string[];
  created: string;
  updated: string;
  links?: NoteLink[];
}

export interface AzkMeta {
  id: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  bodyHash: string;
  hasEmbedding: boolean;
}

export interface AzkLink {
  fromId: string;
  toId: string;
  relation: string;
}

export interface RankedAzk {
  id: string;
  title: string;
  tags: string[];
  created: string;
  score: number;
  keywordScore?: number;
  semanticScore?: number;
}

export interface AzkConfig {
  host?: string;
  model?: string;
  notesDir?: string;
  dbPath?: string;
}

export interface AzkReindexResult {
  indexed: number;
  updated: number;
  removed: number;
  total: number;
}

export interface EmbeddingModelInfo {
  id: string;
  name?: string;
  isEmbeddingCandidate: boolean;
}
