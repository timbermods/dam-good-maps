# land

The generator's land processes (`docs/archive/m9-design.md`): a genome drawn from the theme's prior, then uplift, caprock, erosion and weathering on a height field, snapped to the game's levels, with rivers, lakes, falls and badwater found in its drainage.

**Rules**
- Exact arithmetic only (`num.ts`, PLAN §2.1, D15): + − × ÷, `math/portable.ts` `sqrt`, floor, round, abs, min, max. Angles come from `math/detmath.ts`. Heaps break ties by tile index.
- No river is drawn: rivers follow the eroded field's drainage.
- Intentions are steered, never stamped. A check on the finished map confirms one, and a failed one is dropped, never forced (D138).
- Any change here moves every generated map: re-pin (D308).

**Start from**
- `genome.ts` (the parameter space; `LEANINGS`, `DEFAULT_VARIETY`); `field.ts` `uplift`, `caprock`, `erodeHard`, `weather`; `levels.ts` `snapLevels`.
- `hydro.ts` `planHydro` (rivers, lakes, falls); `hazards.ts` `planBadwater`; `drainage.ts` `drainage`, the one priority flood (the land's, and Carve's downhill guide), and `edgeSpill` (spill levels on whole levels, side to side, as the game's water moves).
- `minePads.ts` `minePads` (the mine sites' level ground, made as the land is shaped, D363) and `roomMap` (where a start's walk has it on the settled water).
- `intentions.ts` (the set, the nudges, the checks).
- `num.ts`: the small exact helpers (`dist`, `bump`, `unit`, `DIRS8`); distance to a polyline is `math/polyline.ts` `polyDist`. `levels.ts` reuses the shared rules where they agree: `footComponents` is `analysis/regions.ts` `landRegions` with sizes, `cleanPitsAndSpikes` the build's `integrityLevel`.

**Tests**: `tests/unit/genome.test.ts`, plus the `gen/` tests, which build whole maps. Run `npx vitest run tests/unit/genome.test.ts`.

Mine room uses the placement's nearest-footprint distance, from the start's 3×3 to the site's 5×5, rather than a square's corner or a centre-distance allowance. The generator supplies the same keep-off mask as object placement, including lake beds, the border and the square water margin (`validate/playability.ts` `nearWater` at `FLOOD_MARGIN + 1`, one mask for the objects, the pads and the `extras.placement` check).
