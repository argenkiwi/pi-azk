# Pi Azk (`pi-azk`)

A Pi Coding Agent extension providing full integration with [`azk`](https://github.com/argenkiwi/azk), the atomic Zettelkasten note-taking and hybrid-search CLI.

`pi-azk` brings the atomic note methodology directly into Pi sessions:
- **LLM Custom Tools**: Callable by the agent during coding sessions to retrieve prior art, record design decisions, and link concepts.
- **Host Sharing**: Azk automatically shares the same host as Pi (e.g. your local Ollama or LM Studio instance), dynamically adapting whenever you switch models in Pi.
- **Interactive Model Selection**: Choose and test embedding models for Azk directly within the Pi interface via `/azk model`.
- **Slash Commands**: Interactive `/azk` command for inspecting status, manual reindexing, and note searching.

---

**Zero dependencies.** Plain JavaScript (ESM, typed with JSDoc) running on Node 24+ built-ins: `node:sqlite`, `fetch`, `node:crypto`, `node:test`. Nothing to install or build.

---

## Installation

### User Scope (Global)

Install the package into your Pi user settings (`~/.pi/agent/settings.json`):

```bash
pi install /path/to/pi-azk
```

Or from git:

```bash
pi install git:github.com/argenkiwi/pi-azk
```

### Project Scope

Install into your current project (`.pi/settings.json`):

```bash
pi install -l /path/to/pi-azk
```

### Try Without Installing

Test the extension in a single Pi session:

```bash
pi -e /path/to/pi-azk
```

---

## Features

### 1. Host Sharing with Pi

Azk automatically derives its embedding host URL from Pi's active model:
- When Pi is configured with a local provider (e.g. Ollama with `baseUrl: "http://192.168.1.12:11434/v1"`), Azk uses that same endpoint for `/embeddings`.
- When you switch models via `/model`, Azk listens to `model_select` and updates its active host dynamically.
- Azk synchronizes `process.env.EMBEDDING_HOST` and `process.env.EMBEDDING_MODEL` so subshells and external CLI calls inherit the same configuration.
- If you prefer to pin a dedicated embedding server, you can set an override with `/azk host <url>`.

### 2. Interactive Embedding Model Selector

Run `/azk model` (or `/azk-model`) inside Pi:
1. Azk connects to your active host (e.g. Ollama or OpenAI-compatible server).
2. It retrieves all models and tags from the server, badging likely embedding candidates (e.g. `nomic-embed-text`, `bge`, `embeddinggemma`).
3. You can pick an available model or type a custom model identifier.
4. Azk automatically probes the endpoint with a test embedding to verify connectivity.
5. The chosen model is saved to `.azk/config.json` and session state.

### 3. LLM Custom Tools

The agent has access to 7 custom tools:

| Tool | Description |
|------|-------------|
| `azk_search` | Blends SQLite FTS5 full-text matching with cosine similarity on semantic vector embeddings. Returns ranked results with scores. |
| `azk_get` | Reads note Markdown frontmatter and body, plus all bidirectional links from the link graph. |
| `azk_create` | Writes a new atomic note (`notes/<timestamp>.md`), embeds the content, updates SQLite FTS5, and creates relational links. |
| `azk_update` | Partially updates a note's title, body, or tags. Only re-computes embeddings if the body changed. |
| `azk_delete` | Removes the note file and cleans up SQLite metadata, FTS5 rows, and link references. |
| `azk_link` | Establishes an explicit, named relationship between two existing notes. |
| `azk_reindex` | Rebuilds SQLite index from disk, embedding added/modified notes and cleaning up deleted orphans. |

Each tool includes system prompt guidelines reinforcing the Zettelkasten protocol:
- **Search prior art** before making design decisions or tackling non-trivial tasks.
- **Record decisions and gotchas** as atomic notes after completing non-trivial work.

### 4. Slash Commands

Interactive commands available directly in the chat UI:

- `/azk model`: Open interactive embedding model selector.
- `/azk host [url]`: View or customize embedding host URL (empty string restores auto-sync with Pi).
- `/azk status`: Display active host, model, probe status, note count, and database paths.
- `/azk search <query>`: Search notes directly from the command bar.
- `/azk reindex`: Trigger a manual reindex of `notes/`.
- `/azk-model`: Direct shortcut to `/azk model`.

---

## Storage & Architecture

Following Azk's design principles:
- **`notes/`**: Source of truth containing atomic `.md` files with YAML frontmatter. Checked into version control.
- **`.azk/azk.db`**: Derived SQLite index containing FTS5 virtual tables and embedding BLOBs. Gitignored.
- **`.azk/config.json`**: Project-level configuration overrides for host and embedding model.

---

## Running Tests

Tests use Node's built-in runner and need no `npm install`:

```bash
npm test   # node --test tests/
```
