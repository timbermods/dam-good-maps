# land

The generator's land processes (`docs/m9-design.md`): a genome drawn from the theme's prior, then uplift, caprock, erosion and weathering on a height field, snapped to the game's levels, with rivers, lakes, falls and badwater found in its drainage.

**Rules**
- Exact arithmetic only (`num.ts`, PLAN §2.1, D15): + − × ÷, `Math.sqrt`, floor, round, abs, min, max. Angles come from `math/detmath.ts`. Heaps break ties by tile index.
- No river is drawn: rivers follow the eroded field's drainage.
- Intentions are steered, never stamped. A check on the finished map confirms one, and a failed one is dropped, never forced (D138).
- Any change here moves every generated map: re-pin (D308).

**Start from**
- `genome.ts` (the parameter space; `LEANINGS`, `DEFAULT_VARIETY`); `field.ts` `uplift`, `caprock`, `erodeHard`, `weather`; `levels.ts` `snapLevels`.
- `hydro.ts` `planHydro` (rivers, lakes, falls); `hazards.ts` `planBadwater`; `drainage.ts` `drainage`.
- `intentions.ts` (the set, the nudges, the checks); `narrows.ts` `planNarrows` (an internal operation, no editor tool).

**Tests**: `tests/unit/genome.test.ts`, plus the `gen/` tests, which build whole maps. Run `npx vitest run tests/unit/genome.test.ts`.
