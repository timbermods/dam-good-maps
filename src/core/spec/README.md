# spec

`MapSpec`: everything that determines a generated map (PLAN §19.1), its JSON schema, and the URL codec for share links.

**Rules**
- A spec is complete, never a diff. The settings panel, the URL codec, the editor's `SpecPatch` and Claude all produce one.
- A share link carries the generator version, so an old link reproduces its map (PLAN §2.1). The fragment writes only the settings that differ from the preset, in a fixed order, so a spec has exactly one fragment.
- Bump `GENERATOR_VERSION` when a change alters generated maps.
- `schema.ts` is an eval-free checker, so it also runs inside a Claude artifact.

**Start from**: `mapspec.ts` `makeSpec`, `GENERATOR_VERSION`, `THEMES`; `codec.ts` `encodeSpecFragment`, `decodeSpecFragment`; `schema.ts` `validateSpec`; `mergepatch.ts` (RFC 7396).

**Tests**: `tests/contract/spec.test.ts` (checks the schema checker against Ajv), `tests/contract/share.test.ts`, `tests/shareCases.ts`. Run `npx vitest run tests/contract/spec.test.ts`.
