# The release gate's generator: a bug hunt

What M9b releases, hunted for reproducible wrong results on 2026-10-03: the generator, the export and
the checks, through the public entry points only (`generate`, the share-link codec, the file read back
with `readTimber`, `validateMap`, `MapSession.fromGenerated` and the project file). The water and the
editor's core were the first hunt (`investigation/release-gate-core/`) and are not repeated.

- **Tested at `feature/m9b` fe3ed80f** (the branch's tip; `dev` at 8b066342 is already an ancestor, so
  merging dev into it changes nothing). The repo's own suite at that sha with four workers: 1,500
  passed, 6 failed: the five settings experiments (`settings.test.ts`: Verticality, Drought reserve,
  Lakes and basins, Waterfalls, Designed for; the first four are the known shortfalls held for the
  settings round 2, `docs/progress/m9b.md`) and `properties.test.ts` at 256² seed 309 (the editor's
  core, the first hunt's area).
- The clone for this hunt is `C:\Users\Kyler\code\DamGoodMaps-gen-hunt` (the prompt's `krams` user
  folder does not exist on this PC).

## Running the tests

From a `feature/m9b` checkout with this folder copied in
(`cp -r <this checkout>/investigation/release-gate-generator investigation/`):

```
npx vitest run --config investigation/release-gate-generator/vitest.config.ts --maxWorkers=4 investigation/release-gate-generator/
```

About two minutes: 9 tests in 7 files, each asserting the decision and failing today. The sweeps that found them are in
`tools/` (`sweep.ts`, `extremes.sh`, `siblings.ts`, `hashes.ts`; each file says how to run it); their
results stay in `local/` (gitignored, D195) and regenerate in about an hour on one core.

## Findings, by how much a player would notice

1. **Another like this on a Lake Basin map loses the theme.** Lake Basin's round-2 shaping
   (`gen/generate.ts`, `shapeLakeBasin`; D453, D458) runs only on a spec that carries no intentions,
   and every sibling carries the map's (D278 (1c)), as does every version the candidates strip
   searches for. At 96², seeds 1–12: the map keeps Lake Basin's promise ("big lakes that dominate the
   water") on 12 of 12, its first sibling on 6 of 12, and seed 7's sibling makes no map at all (12
   attempts, no start); the siblings also need up to 22 attempts where the maps need 1 or 2. At 128²,
   seeds 1–8: 8 of 8 maps, 5 of 8 siblings. River Valley's siblings, for comparison, keep its promise
   on 10 of 12 at 96² (the maps 11 of 12). Breaks D278
   (1c) ("the same theme, settings and intentions, different land") and D453's adoption of round 2.
   `lakeBasinSibling.test.ts`.
2. **Lake Basin 96² makes no map at ordinary panel settings.** Rivers 3: 4 of seeds 1–20 fail every
   attempt (1, 9, 17, 18; seed 1 uses all 40, attempts and free draws). Buildable land: Tight: seed 3
   (stuck after 18, its land already shown). The page then says "No valid map after N attempts. Try
   another seed." At the preset settings 0 of 140 maps at 96² failed. Breaks D278 (candidates until
   one passes the absolutes; a theme's promise at 96² is a known miss, a map that fails is not).
   `lakeBasinSettings.test.ts`.
3. **Variety 100 raises the land past Highest terrain.** With Verticality at its default and Highest
   terrain 16, Any 96² seed 1 at Variety 100 tops out at 21 (Canyon seed 4: 17, Highlands seed 6: 18,
   Lake Basin seed 9: 17; 4 of 70 maps at 96²), the file carrying the tall note the player never asked
   for, and the game's map editor unable to edit the land above 16. `land/genome.ts` does it on
   purpose ("one drawn tall by Variety keeps it too"): at Variety 85+ the genome may draw Verticality
   70–100 and keeps the default cap's 22, so only an explicit cap of 15 or lower holds. Breaks PLAN
   §5.2 ("terrain never exceeds this"; item 36, D172: the two controls never contradict). Two more of
   the 70 (Highlands 8, Islands 2) make no map. `highestTerrain.test.ts`.
4. **A generated map stores water nothing feeds.** Any 96² seed 1 at Relief 100: a one-tile pit at
   (61, 50), level 7, holds exactly 1.0 of water, sealed by ground at 8 and 9 beside a lake standing at
   6.29; no source reaches it, and the game only evaporates it. The canonical settle of the file's
   own land keeps it too (D413's sealed-basin rule), after `withoutUnfed` ran once on the first
   settled state. 1 of 140 maps at 96² preset settings and 1 of 500 at the extremes. Breaks
   D420 and D385. `unfedPit.test.ts`.
5. **Share links the codec passes on that the generator cannot use** (hand-edited links only):
   `c=2t` (two colonies) passes the schema and the decoder, then `generate` throws "multi-colony
   maps are not built yet", where the codec's rule is that a mistyped link reports its problem and
   still opens a map; and intentions that do not exist (`in=not-an-intention.also-bad`) pass the
   schema's pattern, are dropped silently (the map is steered toward none, not its own), and the
   map's own share link carries the bad names on. `another.test.ts` only refuses them through a
   capital letter. Breaks PLAN §14.5 and D342 (rejected with a reason, never silently changed).
   `links.test.ts`.
6. **Mine sites 4 places three.** Lake Basin 96² seed 1 at Mine sites 4 has three mine sites, without
   a word: the check asks only that two be reached. 1 of 9 maps at that setting. Breaks PLAN §5.5 (a
   count the player sets, 2–4). `mineSites.test.ts`.

## Clean

The sweeps ran at 96²: every theme at seeds 1–20 (140 maps, the preset settings), the settings at
their extremes on three themes at seeds 1–3 (500 maps, `tools/extremes.sh` up to the start rules;
the difficulty, the combinations and the species mixes were still running when this report closed),
Variety 100 on every theme at seeds 1–10, Lake Basin at Rivers 3 and Tight at seeds 1–20. The larger
sizes were spot-checked only (128² seed 8 and the Lake Basin siblings at seeds 1–8; 48², 49², 48×256
and 256×48 at seed 5); the 128², 192², 256², 48² and non-square sweeps were queued and not finished.

- **The file the game loads:** every map that passed its checks re-validates from its own bytes with
  the same verdicts; the stored water equals the canonical settle of the file's own land and sources
  (finding 4's pit included: the settle keeps it); every object loads (the load checks, tried on 17
  hand-built files the game would prune or refuse, refuse each); the land never exceeds Highest
  terrain apart from finding 3; the deepest bed stands at least 3 above the floor; every map has a
  badwater source and its reached mine sites, at 96² at least 22 tiles' walk out (the bands shrink
  by 0.75); the file's heights are the build's.
- **The first land shown is the map (D348):** no tile changed after `onLand` on any map of the sweeps.
- **The editor's export and the project file:** `MapSession.fromGenerated` exports the generator's
  bytes, and the project saved and reopened exports them again, on every map of the sweeps.
- **Determinism (D366):** the same spec gives the same bytes in a fresh process, after other maps,
  with every callback passed, and twice in one process; the page's worker passes only callbacks.
- **Settings at their extremes:** the off and none settings hold (no relics, no geothermal fields,
  no thorns, no badwater, no sources, no edge river at Rivers 0, three at Rivers 3, Highest terrain
  10 held, Verticality 100 under Highest terrain 10 held); the species mix at its extremes plants
  what it says, with pines added near the start for the logs floor where succulents give none (PLAN
  §5.6); seeds 0 and 4,294,967,295, sizes 48², 49², 48×256 and 256×48 make maps. Thresholds no land
  can meet (Minimum starting bushes 200 with wood 800 and water within 4) fail every attempt, as
  designed. Only findings 2, 3, 4 and 6.
- **Share links:** every setting and the sibling fields round-trip; a 0.7.0 link reads with today's
  defaults and the version note. Only finding 5.
- **The checks:** none passed what it should refuse on the sweeps' files or the hand-built ones, and
  none refused a map at the preset settings.
