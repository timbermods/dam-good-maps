# render

Top-down colours for a map: an elevation ramp with a north-west hillshade, plus water. Used by the 2D preview, the map thumbnail, and the cards and contact sheets the tools make. The 3D view is in `src/render3d/`.

**Rules**
- Pure arithmetic, so the thumbnail bytes are identical in every engine. The thumbnail is part of the deterministic `.timber`.

**Start from**: `shade.ts` `shadeTiles`, `thumbnailRgba`, `thumbnailJpeg` (`THUMB_W` × `THUMB_H`, 960 × 540).

**Tests**: covered through the file bytes in `tests/unit/format.test.ts`. Run `npx vitest run tests/unit/format.test.ts`.
