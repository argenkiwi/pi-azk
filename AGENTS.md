# pi-azk

Pi extension for the `azk` Zettelkasten. Plain JavaScript (ESM) with JSDoc types, Node >= 24.

- **No dependencies.** Use Node built-ins (`node:sqlite`, `fetch`, `node:crypto`). Do not add npm packages without a strong reason; Pi supplies its own packages at runtime, referenced only in JSDoc `import("...")` types.
- **No build step.** Entry point is `extensions/index.js`; tool parameters are plain JSON Schema literals.
- **Frontmatter** is handled by a small purpose-built codec in `extensions/core/fs.js` (a subset of YAML). Extend it and its tests in `tests/fs.test.js` if note format needs grow.
- **Tests:** `npm test` (`node --test`). Keep them offline: stub `globalThis.fetch` and use `mkdtemp` directories.
- **Notes:** this repo uses its own `notes/` Zettelkasten. Search before non-trivial work and record decisions and gotchas (see the global azk protocol). `.azk/` is derived and gitignored; run `azk reindex` after a fresh clone.
