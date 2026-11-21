# Lake Basin round 7c: tools and where the gate goes

These are the measuring tools of round 7c (Lake Basin above 128²): `lk.ts` measures the lake's sill width and its depth below the sill; `dbad.ts`, `dst.ts`, `drc.ts` and `dwall.ts` dump the start's badwater view, start numbers, reach and rim faces; `moist.ts`, `lakes.ts` and `cap.sh` with `shots-low.json` make the moist share, lake list and low sheet. They import from `src/` and run from the worktree's root with `npx tsx`.

**Where the gate goes.** Every river is carved no deeper than `BED_FLOOR` (3, D325): `hydro.ts` clamps `run` to it (around lines 1547, 2085 and 2304 at cc351e38), and `generate.ts` (~1850) lifts anything cut below 3 back to 3. The pass that 7c never built: for Lake Basin, the basin's base goes to 5 and the lake is dug to 3. Rivers inside the basin take a floor of the lake's surface (4), not `BED_FLOOR`, so they end at its shore. Only the leaving river falls below the sill. The gate is that per-course floor in hydro.ts's clamps, keyed on `g.basinWarp`.

**What 7c tripped on.** g1 raised the base from 3 to 5, but the carve still clamped to the global `BED_FLOOR`, so the rivers still ran below the lake. The rule was never tested. The spill plan (`lakesAtSpill`, kept on this branch) measured that the land holds a lake of at most 0.017 of the map, against the bar of 0.06. Four rounds of patches oscillated, with attempts 6/8 → 16–25 per six. Room was held below 400 by the settler's shared rows rule.

**Kept from 7c, and good:** rim gullies (`notchWalls` run again on walls of 4+, reach on s4 8.5k → 22.9k); badwater kept 90 tiles off the planned start; `badViewWide`; fix B in `courses.ts` (drowned heads read only where water stands; moves only delta 128² s4).
