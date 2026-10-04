# features

The one build pipeline (PLAN §19.8): parametric features in, terrain and entities out. Generation and the editor run the same code, after every edit.

**Rules**
- `build` is a pure function of its input; rebuilding a saved document reproduces the map exactly.
- Steps run in a fixed order. Each rasteriser writes only its own region, so an edit rebuilds only the area it touches (PLAN §19.7).
- Each feature draws from its own random stream, so changing one leaves the rest alone.
- The brush code (`raster/brush.ts`) is shared by the build and the page, so the map under the cursor is the map the stroke builds.
- Ids are hashed from the owner, never random (`ids.ts`, PLAN §19.4).

**Start from**
- `build.ts` `build`, `buildMap`, `previewTerrain`; `schema.ts` (feature kinds; `features.schema.json`).
- `raster/terrain.ts` (landforms, lakes, rivers, sculpt edits, the integrity pass), `raster/brush.ts`, `raster/resources.ts`.
- `slopes.ts` (derived slopes, step 8), `edits.ts` (overlays from the log), `objects.ts`, `route.ts` (outflow channels).
- `setpieces/`: one builder per kind, shared by the generator, the editor and Claude.

**Tests**: `tests/contract/` (features, brush, objects, setpieces, narrows, ops, projects; reshape and rivers are heavy). Run `npx vitest run tests/contract/features.test.ts`.
