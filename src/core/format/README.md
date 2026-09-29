# format

Reading and writing the game's own files: the `.timber` zip, `world.json`, JSON in the game's style, entities, footprints, and import normalisation. `FORMAT.md` at the repository root documents every field.

**Rules**
- An unedited file re-serialises byte for byte. Unknown data passes through untouched.
- The same map gives the same bytes in every time zone (`timber.ts` writes the zip dates from the world's timestamp).
- Import normalisation applies the game's own load-time migrations once, and lists each change for the player.
- Heights up to 22 are allowed; the editor's own ceiling is a separate constant (`world.ts`, D172).

**Start from**
- `timber.ts` `readTimber`, `writeTimber`; `world.ts` (the world in memory, `GAME_VERSION`, height constants).
- `json.ts` `parse`, `stringify` (floats stay `JsonFloat`); `entities.ts` (entity builders); `footprints.ts` (block footprints of every template).
- `normalize.ts` `normalizeImport`; `base64.ts`; `vendor/` (third-party code).

**Tests**: `tests/unit/format.test.ts`, `tests/unit/normalize.test.ts`, `tests/contract/import.test.ts`, `tests/contract/timezones.test.ts`. The Python reader `prototype/tbmap.py` is the reference. Run `npx vitest run tests/unit/format.test.ts`.
