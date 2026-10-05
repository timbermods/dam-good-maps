# spec

`MapSpec`: everything that determines a generated map (PLAN §19.1), its JSON schema, and the URL codec for share links.

**Rules**
- A spec is complete, never a diff. The settings panel and the URL codec produce one.
- A share link carries the generator version, so an old link reproduces its map (PLAN §2.1). The fragment writes only the settings that differ from the preset, in a fixed order, so a spec has exactly one fragment.
- Bump `GENERATOR_VERSION` when a change alters generated maps.
- `schema.ts` is an eval-free checker: it generates no code at run time.
- A link or a saved spec from before D462 may carry `sp`/`setPieces` and `k`/`constraints`: they are ignored or dropped,
  and the map is the same.

**Start from**: `mapspec.ts` `makeSpec`, `GENERATOR_VERSION`, `THEMES`; `codec.ts` `encodeSpecFragment`, `decodeSpecFragment`; `schema.ts` `validateSpec`; `mergepatch.ts` (RFC 7396).

**Tests**: `tests/contract/spec.test.ts` (checks the schema checker against Ajv), `tests/contract/share.test.ts`, `tests/shareCases.ts`. Run `npx vitest run tests/contract/spec.test.ts`.
