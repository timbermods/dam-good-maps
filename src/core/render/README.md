# render

Top-down colours for a map: an elevation ramp with a north-west hillshade, plus water. Used by the 2D preview, the map thumbnail, and the cards and contact sheets the tools make. The 3D view is in `src/render3d/`.

**Rules**
- Pure arithmetic, so the thumbnail bytes are identical in every engine. The top-down thumbnail is the deterministic default: every `.timber` the core writes (headless exports, the CLI, share links, CI's byte checks) carries it.
- The page's saves carry the map's 3D picture instead (D488): `src/render3d/hero.ts` draws it in the High look, and `format/timber.ts` `replaceThumbnail` puts it in, every other entry kept byte for byte. A file that keeps its own picture (an unedited import) keeps it.

**Start from**: `shade.ts` `shadeTiles` (and its two halves: `groundShade`, the land's colours, which the minimap keeps while only the water moves, and `shadeRgba`, the water put on them straight into an image), `thumbnailRgba`, `thumbnailJpeg` (`THUMB_W` × `THUMB_H`, 960 × 540); `thumb.ts` `thumbnailPixels`, the small picture for Your maps and the candidates strip (D234).

**Tests**: covered through the file bytes in `tests/unit/format.test.ts`. Run `npx vitest run tests/unit/format.test.ts`.
