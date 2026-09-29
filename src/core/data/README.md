# data

Numbers read from the installed game and pinned in the repository.

**Rules**
- Never edit `footprints.json` or `log-floor.json` by hand. Regenerate them with the tool that made them, and note the game version.
- `log-floor.json` holds the starting-logs floor (D224, D227): the logs a colony needs to reach a Forester, plus the first essentials, plus 10%. Every map has at least this many within about 40 tiles' walk of the start.

**Start from**
- `logFloor.ts`: `LOG_FLOOR`, `LOG_FLOOR_WALK`, `LOG_FLOOR_GAME_VERSION`, `LOGS_PER_TREE_SPECIES`.
- `footprints.json`: the block layout of every map template; `format/footprints.ts` reads it.

**Regenerate**: `tools/log-floor.ts` (needs the installed game's blueprints) and `tools/export-footprints.ts` (from `investigation/notes/footprints.json`).

**Tests**: `tests/unit/log-floor.test.ts`. Run `npx vitest run tests/unit/log-floor.test.ts`.
