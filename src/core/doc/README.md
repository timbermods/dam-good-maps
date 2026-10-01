# doc

The map document and its edit engine: a generation plus an ordered log of edit operations, with undo and redo, incremental rebuilds, export, and the project file (`.damgoodmaps.json`, gzip-compressed).

**Rules**
- A saved document rebuilds to the same map, byte for byte, even after the generator changes (PLAN §19.7). The base map is stored and never mutated.
- Operations are small and serialisable, and are checked against their schema and the current map. An invalid one is rejected, never clamped silently.
- Old saved strokes and operations replay exactly (D158). Changing an operation's meaning breaks saved projects.
- Headless: it runs in the page's worker and in Node.

**Start from**
- `session.ts` `MapSession`: `apply`, undo and redo, export. Edits never replay onto new land (D336): no regeneration under a document's edits.
- `ops.ts`: the operation envelope `{op, params}`; the schema is `ops.schema.json`.
- `document.ts`: `toDocument`, `importDocument`, `encodeProject`, `DOCUMENT_FORMAT_VERSION`.
- `base.ts` (the stored base map), `placing.ts` and `tools.ts` (turn a request into planned features and operations), `bake.ts` (old drawn landforms become plain terrain, D182).

**Tests**: `tests/contract/` (document, ops, bake, import, projects, views, sourcesUnderEdits, editor; properties is heavy). Old project files live in `tests/fixtures/projects/`. Run `npx vitest run tests/contract/ops.test.ts`.
