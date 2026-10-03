# M9b: composition and variety

## Hand-over (2026-10-02): dev merged, the adoption order through generation speed round 2

Written for a session with no memory of this one. Branch `feature/m9b`, draft PR #70 into `dev`, never
merged by Claude. The hand-over of 2026-10-01 below is history where this one differs.

### What this round did, in order (each measured on the 840 maps: seeds 1–40, seven themes, 96², 128², 256²)

1. **`dev` merged** (bfc5ed80): the forces, the High look, the salvaged page core. Living docs took
   `dev`'s pruned text with M9b's still-true additions re-applied (PLAN §5.2–§5.5, §7, §7.9, §10,
   §13, §14.3, §19.1; EDITOR_PLAN's header menu); `docs/decisions-pending.md` keeps `dev`'s open rows
   plus M9b's open #100–#154, the six Kyler settled moved to the archive. M9b's own code now uses the
   portable maths (D366, 7beda126: every native approximate call and `**` in `src/core` replaced; a
   square is a product, which fdlibm's pow returns for y = 2). **The merge moved no land at any
   size** (measure `m1-merge` against `13d1f1a2`: same 2/0/0 failing, same 213/228/229).
2. **One mine-site check** (f3706e62): `resources.mine_reach` folded into `resources.mine_site`, read
   with `colonyReach` everywhere (D342); in the editor (`mineCutAtOpen`) it is advisory and also fails
   on a site an edit cut off since the map was opened (`minesOutOfReach`, `mineSitesCutAt` on the
   stored water).
3. **The three contract tests failing on the base** (#155), explained and re-pinned (4a785170):
   `resources`' grove fill is read on the map's own groves beyond the start's 25 tiles (item 26's
   living-only start planting packs the walk's scarce moist ground: Canyon 96² seed 5's start 308 trees
   at a fill of 0.76, its own groves 0.36); `rivers`' two drawn-river cases join D277's skip (the
   drawn-river planner, unmaintained until M12, gets the source rule's narrowed mouth row but not the
   edge lip, so water beside its row runs off; when M12 resumes, `planRiver` lays the lip).
4. **Small starts** (#153, affe89b9), then **generation speed round 1** (#155, 37e144b2), measured
   together (`m2-small-r1`): failing **0 / 0 / 0**, all three **215 / 229 / 229**, exactly the
   investigation's own result, every land changed among its changed maps (round 1 byte-identical, as
   built). Any 96² seed 31 and Islands 96² seed 4 pass; Canyon 128² seed 5 gains all three.
5. **The 128² gate on small starts' hidden land** (3569e67c, a default for Kyler, below).
6. **Generation speed round 2** (#155, 892cc5c2), measured with the gate (`m3-r2`): failing **0 / 0 / 0**, all three
   **220 / 230 / 230**, per theme exactly the investigation's round 2 (at 96² Canyon 26 → 28,
   Highlands 21 → 23, Lake Basin 23 → 24; Canyon 128² 32 → 33; Lake Basin 256² 23 → 24); no theme's
   share fell. No map was worn (`fixes`: one "rising basin fed gently" at 256²).

   | Theme, seeds 1–20 (target 14) | 96² | 128² | 256² |
   |---|---|---|---|
   | Any | 19, water (1) | 18, water (2) | 17, water (3) |
   | River Valley | 18, promise (1) | 18, promise (1) | 16, water (3) |
   | Canyon | 14, promise (4) | 17, promise (3) | 15, water (4) |
   | Highlands | **10**, promise (8) | 15, promise (5) | 17, promise (3) |
   | Lake Basin | **13**, promise (7) | **13**, water (6) | **12**, promise (7) |
   | Delta | 19, standout (1) | 18, standout (2) | 17, standout (2) |
   | Islands | 20 | 20 | 20 |

   Under the target: Highlands 96², Lake Basin at every size (Lake Basin round 2 is the planned
   fix). The rows are committed as the new baseline,
   `investigation/m9b/baseline/3569e67c-*.jsonl.gz` (`compare.py 3569e67c <run>`; nothing since
   3569e67c changes a map).
7. **A generation's record holds no wall-clock time** (10cd7063): CI's cross-engine check (`engines`)
   failed on every map with a failed attempt, because `failures` carried each attempt's milliseconds;
   they moved to `timings.failed`. Terrain, water, objects and file bytes already matched in all four
   engines.
8. **Tooltips** on M9b's settings-page controls (8dbb1943, D351).

### CI on #70

At 8dbb1943 `test` and browser shards 1, 2 and 4 were red on maps that moved. After step 4's re-pins
(3bd9f12d) the quick suite passes locally (1,255 tests, 173 files); the browser specs re-pinned pass
locally but for the tooltip test's one line in `src/editor/Header.tsx` (below). The heavy suite: the
settings experiment 30 of 34 (below), the rest green.

### Defaults this round chose, for the milestone session to number and put to Kyler

- **Small starts' hidden land holds at 128² and under only** (`SHOW_PROVED_MOST`). #153 shows a land
  only once its actual settled start reaches its mine pair, so the first look waits for the settle:
  under the same load the first look moved from 34% to 83% of the time to the map at 256² (46% to
  73% at 96², 41% to 77% at 128²), which would put 256²'s editable land near 7–8 s on a quiet machine against D278's
  3 s typical. 128² is judged by its settled map (2 s / 5 s), and every land #153 redrew was at 96² or
  128² (none at 256² of the 840 default maps). Above 128² the land shows at the land stage, as D348
  had it. The cost, found later: on 40 chaos maps at 256² it fails 3 (no start on the shown land)
  where #153 as approved fails 1. A one-line switch (`SHOW_PROVED_MOST`) for Kyler.
- **Round 2 ends the worn way out on generated maps** (D350 (b)): `wearFix` never runs (a prepared
  land keeps its heights); the two maps that needed it (River Valley 256² seed 39, Lake Basin 256²
  seed 24) are fed more gently instead (`drainFix`: 0.7, 0.49, 0.343 of the feeders). `water/outletWear.ts`
  stays for now, unused by the generator. Adopted as approved; it removes D348's one exception.
- The grove-fill re-pin and the drawn-river skip (item 3 above).

### Timings that wait for the quiet window (none was taken: the machine ran three other sessions' suites)

- Small starts' first look at 96² and 128² against `m1-merge`'s (the gate keeps 256² as it was).
- Generation speed round 1's CPU saving (Codex: about 6% at 256²) and round 2's time per map.
- **Lake Basin round 2**: its adoption waits for a quiet-machine timing showing it is no slower than
  today (its own report: revised first land 4.8 / 8.4 / 15.3 s median at 96² / 128² / 256² under load).
- Speed at 256² against `dev` (D380: M9b must not release slower).

### For the page session (its three dependencies, all on `feature/m9b`)

- **Candidate events** (item 22): `generate(spec, { onCandidate })` (`gen/generate.ts`) calls
  `onCandidate({ attempt, candidate, of, result, outcomes })` for the map; the worker forwards it as
  the progress event `{ kind: "candidate", attempt, candidate, of, met, W, H, heights, water }`
  (`worker/api.ts` `runGenerate`). The other versions: `findVersion({ spec, intentions, heights },
  { stop })` (`gen/versions.ts`, the worker's `runFindVersion`/`stopVersionSearch`) returns the first
  sibling meeting all three outcomes (`variation` 1, 2, … on the spec, its own share link), with
  `missesOf`, `worthSearching`, `notifies` and `versionNote` as plain functions.
- **Sources: Placed · None**: `spec.settings.water.sources?: "placed" | "none"` (share link `so=n`);
  `withoutSources(result)` (`gen/generate.ts`) gives the map without its sources and their water.
- **The automatic water fix** (D330, the UI brief §5): `waterFix(session)` (`doc/waterFix.ts`)
  returns `{ ops, label, fixes, at }` or null, the operations to apply as one step (a spring by the
  start); the worker's `waterFixOps()`.

### Two edits M9b needs in the page session's files (not made here, D388)

- `src/editor/Header.tsx`: M9b's **Another like this** menu item's title is 73 characters; D351 asks
  for one short phrase (the settings page now says "A new map like this one, on different land").
- `src/editor/Editor.tsx`: the message strip's **×** (`aria-label="Dismiss"`) has no tooltip. M9b's
  maps show a message when the editor opens, so `tests/e2e/tooltips.spec.ts` meets it in every state.

### Next

- Chaos at 256²: 1 to 3 of 40 fail (no start on the shown land), under D273 (6)'s pass rate.
- For Kyler's eye on the review set: Islands in one layout, Delta close to one (outcomes 4 and 5).
- Lake Basin round 2 after its quiet timing; the settings round 2 (held, last: Verticality, Lakes and
  basins, Waterfalls, Designed for); the quiet window's timings above.

### Step 4 (2026-10-02, later): tooltips, groves, the canyon reading, 256², the re-pins, the review set

- **The pooled probe batch `20261002-1610-batch`** (D218, D308; on 3bd9f12d, from the probe folder, with
  Kyler's installed mods): the M9b group, 23 maps (two per theme at 128², two chaos maps at 256², two
  Sources: None, D358's four slow-settling maps and Lake Basin 256² seed 24 fed gently by round 2).
  **142 checks passed, 0 failed**, 23 screenshot sets recorded; the restore clean (only Steam's
  `steam_autocloud.vdf` files changed). Results in `C:\dgm-probe\results\20261002-1610-batch\`
  (local; `summary.md`, `verdicts.json`). For STATUS and #57. Two runner fixes on the way: the in-game
  log's path after the prune (383c3442; `dev` has the same stale path), and a launch from this
  session's shell needs the per-user .NET 8 first on PATH (a first try, `20261002-1555-batch`, failed
  at the mod's build and launched nothing). The runner's quiet check reads no load on this machine
  (`Get-Counter` fails, so it always reports "load 0%").
- **The two tooltip failures, found** (1ac45606). The editor's message-strip ×: `tests/e2e/tooltips.spec.ts`
  placed a mine site 10 tiles from a water source it had just placed on River Valley 96² seed 9; on
  M9b's map that ground is level and the source's water spreads over it, so on CI's slower machine
  it reached the site, the editor refused the placement ("The water is in the way …"), and its
  message's × (no tooltip, in `src/editor/Editor.tsx`, as on `dev`) showed in every later state.
  Reproduced with the CPU slowed 6×; the test now finds the mine site an open, level, dry spot of its
  own, 24 tiles or more from the source. The other failure is M9b's own line in the page session's
  file: `src/editor/Header.tsx`, the ⋯ menu's **Another like this** item (`role="menuitem"`), its
  `title` 73 characters; D351 asks for one short phrase. The change it needs: `title="A new map like
  this one, on different land"` (43 characters, as the settings page's button says now). Not made
  here (D388). Optional, latent on `dev` too: the message strip's × (`aria-label="Dismiss"`) has no
  `title`; `title="Dismiss this message"` would cover any future message in the tooltip test.
- **The map's own groves stay open where moist ground is narrow** (365ee6f6). After round 2, Canyon 96²
  seed 5's own groves stood at a neighbour fill of 0.70 (official 0.41; the resource test's bound
  0.52), about one map in eight over 0.52 in a survey of 100: `planGroves` kept every tile of a grove
  the ground cut short. Now the map's own groves keep 0.52 of such a blob; the start's planting is
  unchanged. Measured (`m4-groves`): no land changed, outcomes identical (220/230/230), nothing failing,
  living trees' median within 0.5%, the floor walk's logs at least 210.
- **The canyon reading's separate effect** (Canyon seeds 1–20, the reading as before d4d2177c against
  the tip, `c-old`): all three 14 / 17 / 12 at 96² / 128² / 256² with the old reading, 14 / 17 / 15
  with today's; the promise 18 / 17 / 16 against 16 / 17 / 19. The reading from the first dry tile out
  is worth three Canyons at 256² and nothing at the smaller sizes (at 96² it reads two fewer promises
  but the same maps meet all three).
- **Speed at 256²**: CPU profiles of the median maps (Lake Basin 15, Highlands 23, Canyon 38, Any 33;
  under load) put the water settle at 14–37% of `generate`, making the field (uplift, the noise) at
  5–14%, the outcome readings (`signatureOf`, its sorting median) at 4–12%, drainage at 6–10%; a map
  makes one thumbnail. No byte-identical change worth its risk is left after #155's two rounds; the
  comparison with `dev` waits for the quiet window (D380). No timing was taken.
- **The 96² start class**: Any 31 and Islands 4 pass (small starts, round 2's pre-fill mine check);
  Highlands 14 passes on its seventh attempt as before (its shown land's first start lacks berries,
  `start.food`, and the next passes); nothing changed for it.
- **Rivers 0 holds on River Valley** (d6ded4a3): the nightly settings experiment found every River
  Valley map at Rivers 0 with an edge river (River Valley's default trunk, D370, overrode the player's
  0); `tests/contract/riversZero.test.ts`. Default maps unchanged.
- **The nightly settings experiment** (`settings.test.ts`, 4 seeds at 96²): 30 of 34 pass. Still short,
  for the settings round 2 (held, last): Verticality (cliff share 0.187 → 0.164 from 10 to 90, the
  wrong way), Lakes and basins (moved 1.7, at least 3), Waterfalls (2.0, at least 2.5), Designed for
  (the badwater distance from Easy to Hard 31.5 → 37.4, the wrong way: item 47 keeps badwater off the
  start's water and farmland whatever the difficulty, #145). The hand-over of D333 had Verticality and
  Lakes and basins weak; Waterfalls and Designed for are new since.
- **The nightly force sweep** (`forceEverywhere.heavy`, D356): Quake's slide moves nothing on Delta
  128² seed 5's flat plain (at Power 10 at random and flat spots, the clicked slide on flat ground at
  50 and 90) and at Islands 128² seed 5's sea edge (Power 90): recorded in `KNOWN` for Kyler, by theme
  (bafcff22), as D356 has it.
- **The D148 re-pins**, by area (each with its reason in the test; the lists are under "Tests updated"
  below): M9b's generator tests (a Sonnet agent, 51d269e2), `dev`'s force, editor and page-core tests
  on M9b's maps (3bd9f12d), the browser specs (a15ec4b8), small starts' Canyon 128² seed 9 (82f0e269).
  The old project in `strokesBeforeD322` opens to the same heights and replays every step the same;
  its objects follow M9b's one rules switch (D308): 13 derived slopes fewer, and the two birches and a
  ruin column they displaced back; its entities digest is re-pinned.
- **Chaos at 256²** (Any at Variety 100 and Verticality 100, seeds 1–40): with the 128² gate 3 fail
  (seeds 16, 24, 26: no start on the shown land), all three on 32; with #153 as approved (no gate) 1
  fails (seed 16), all three on 34, its first look at about 87% of the time to the map against 43%.
  Either way under D273 (6)'s pass rate (98%, PLAN §15): chaos at 256² is M9b's next generator work.
  The review set's chaos pick Any 941 fails the same way.
- **The review set** (afe1d8b2, `investigation/m9b-review/`, made from 365ee6f6): the contact sheet
  (`docs/sheets/m9b.png`), each theme beside M9a's maps, 14 random maps and three chaos maps in 3D, the
  start areas. What an eye sees first: Islands' 30 maps are one layout (one big central island in a
  sea ringed by islets; D370's sea-first shaping), and Delta's 30 are close to one (a river across a
  green plain with a channel or two), against outcome 4 (any handful differs) and outcome 5 (no theme
  stuck in one template). For Kyler's eye.
- **Findings for the milestone session** (each needs an owner; the first may touch the release gate):
  - the water: on `tests/e2e/brushKit.spec.ts`'s old seed 34 a pit dug on a dry plateau fills with 1.86
    of water a few seconds after the stroke, from no path the agent could find, the map's water rising
    by exactly the pit's volume (the release gate, D385: water that appears from nowhere would not be
    the game's); the spec moved to seed 36, whose pits stay dry;
  - the High look's flow at a map-edge fall's lip (Highlands 128² seed 5 at (86, 127)): the view pours
    0.26, the settle 0.03 (`look-waterfalls` moved to seed 4);
  - a river-head spring the build derives again a tile over after a Quake Lift gets a new id
    (`editsPlaceNothing` counts it as added; seed 3 at 128²);
  - Canyon 96² seed 3 with every object on and three mine sites returns no start (one of 60 such maps).

### After acceptance: CI on #70 green again, then the 840-map measures (2026-10-02, night)

CI on #70 was red on two jobs after the Islands and Delta acceptance, both from the sea's code, not
from pins. Each was traced to its cause and fixed (e3130755). The quick suite needed no re-pin.

- **`engines`: Islands 128² seed 1 differed in Chromium.** Chromium's sort differed from node's,
  Firefox's and WebKit's. The cause was a start scored NaN.
  - The sea's shelves (D410) rise a level and leave the planned water.
  - The kept-water mask still marked them, so the start's walkable land gave them no label.
  - A start on a shelf scored NaN, and a sort over NaN scores runs differently in each engine.
  - Fix: the risen shelves leave the mask, so they count as dry land.
  - The smoke list then matched, Chromium against node: 183 cases, 0 mismatches.
- **`oracle`: Islands 256² seed 19 never settled** (`water.settles`, with no start and no mine sites
  after it).
  - Its sea, 21,911 tiles, was still rising over its one narrow way out at the end of the six days.
  - The fix for a rising basin at 256², a gentler inflow (0.7, 0.49, 0.343 of its feeders, #155), ran
    only for River Valley and Lake Basin. It now runs for a sea too, and the map passes.
  - The change can reach only 256² sea maps whose water failed to settle.
  - CI's oracle list then passed locally: 21 maps, 0 failures, 0 disagreements. This map takes
    79 s, the slowest of the 21.
- The quick suite passes locally with both fixes, with no re-pin (179 files, 1,305 tests). The
  re-pins after D416 and D430 were already made: badwater (Any 23), smallStarts (Islands 4) and
  objects (Islands 3).
- **Latent, outside M9b's code:** `pickStart` still scores NaN on a tile the walkable land leaves
  unlabelled, which the editor's locked mask can do. Treating such a start as joining no land would
  close it. Left for the editor's owner.
- CI on #70 went green at 49d87d74. Browser shard 4 failed once first, on `waterView.spec.ts` line
  176: a 10 s poll for water in a stroke's channel on River Valley 96² seed 8, a map these fixes don't
  touch. The same line failed once before, at 0eb655a0. The rerun passed.

**The 840-map measure** (`m5-accepted`, 8 jobs, src as at e3130755; against the baseline 3569e67c):

- **Failing an absolute: 0 / 0 / 0** at 96², 128², 256².
- **Lands changed: Any, Delta and Islands only**, all 40 seeds of each at every size. The other four
  themes are unchanged, map for map.
- **All three outcomes: 178 / 210 / 211** of 280 (before: 220 / 230 / 230). Every loss is in the three
  redesigned themes. Seeds 1–20, the target 14 of 20:

  | Theme | 96² | 128² | 256² |
  |---|---|---|---|
  | Any | 16, water (4) | 17, water (3) | 17, water (3) |
  | River Valley | 18, promise (1) | 18, promise (1) | 16, water (3) |
  | Canyon | 14, promise (4) | 17, promise (3) | 15, water (4) |
  | Highlands | **10**, promise (8) | 15, promise (5) | 17, promise (3) |
  | Lake Basin | **13**, promise (7) | **13**, water (6) | **12**, promise (7) |
  | Delta | 15, water (5) | 15, water (5) | 14, water (5) |
  | Islands | **2**, promise (18) | **12**, promise (7) | 14, water (4) |

- **Islands at 96² keeps its promise on 2 of 20.** The promise asks for 3 islands or more, the main
  body a quarter of the map, and 5% of the land apart. At 96² most of the safe version's seas read 0 to
  2 islands. Kyler judged the safe version at 128², where it keeps the promise on 13 of 20 here.
  Nothing is changed for it: Kyler decides.
- **Delta misses the water outcome on 5 of 20 at every size** (before, it missed the standout on 1
  or 2). On all 15, a river's planned course is dry in places:
  - on 10, the main river holds water on 55–83% of its course (the reading asks 85%);
  - on 5, another river holds water on 42–59% of its course (it asks 60%).
  - The main system holds 84–100% of the water. Whether the fan's water leaves the planned course for
    another channel is not yet read.
- Fixes used: "rising basin fed gently" on 5 maps at 256² (1 before): Lake Basin 24 as before, and
  Islands 5, 19, 20 and 32, whose seas were still rising. No way out was worn. No map was shown more
  than once.
- Time, under load (8 jobs), the medians of the CPU-scaled time to the map against the baseline's.
  The four unchanged themes match within a few per cent. The three changed ones are slower:

  | Theme | 96² | 128² | 256² |
  |---|---|---|---|
  | Islands | 8.0 → 10.0 s | 11.4 → 14.3 s | 42.7 → 50.9 s |
  | Delta | 5.4 → 6.4 s | 8.7 → 9.9 s | 18.7 → 22.5 s |
  | Any | 6.8 → 6.5 s | 8.3 → 8.7 s | 25.0 → 27.9 s |

  Islands is the slowest theme at 256². D380's comparison with `dev` waits for the quiet window.
- The rows are committed as the new baseline, `investigation/m9b/baseline/e3130755-*.jsonl.gz`
  (`compare.py e3130755 <run>`).

**The heavy suite** (nightly; on 1179614b, under other sessions' load): 47 pass, 16 fail.
- `settings.test.ts`: the four known shortfalls held for the settings round 2 (Verticality, Lakes and
  basins, Waterfalls, Designed for), as before.
- `properties.test.ts`, all four presets: the project file reopens to a different file. On River Valley
  96² seed 306 the session holds dead blueberry bushes (`IsDead`, the kept bushes an edit floods,
  D425) that the reopened project does not rebuild. **`dev` (478fefad) fails the same case**, so it is
  not M9b's.
- `editSequences.heavy.test.ts`, 8 themes and sizes, including the four themes whose maps did not
  move: a force's edit adds a `WaterSource` (a river head's spring derived a tile over, the finding
  above), and on three sequences a bush or an oak. River Valley 96² passes on `dev`'s maps, so M9b's
  maps bring it out.

### Islands accepted: the safe version (D429–D430, 2026-10-02, 19:12), and islands to expand to

Kyler released the safe version: all 30 pass, the promise on 20, all three outcomes on 19
(`docs/sheets/m9b-islands.png`). The start on an island is not required (D429), and the 1,200-tile
island-start rule (D428) lapses with the grown variant. The big-island and grown patches stay in
`investigation/m9b/` as history.

**His check: an island to expand to** (`investigation/m9b/islands-reach.ts`, seeds 1–30 at 128²).
What counts:
- An island is dry land (water at most 0.05 deep), not joined to the start's land, clear of the
  map's edges, and 150 tiles or more.
- It is reachable across at most 8 tiles of water at a time: a bridge, levees or a dam across a
  strait, hopping on from any land reached. A land bridge makes it the start's own land.
- Every start stands on the shore.

| Seed | Largest reachable island, tiles (strait) | Seed | Largest reachable island, tiles (strait) |
|---|---|---|---|
| 1 | 489 (1) | 16 | 671 (7) |
| 2 | 209 (1) | 17 | none (largest island 207, farther) |
| 3 | 599 (5) | 18 | 635 (2) |
| 4 | 731 (7) | 19 | none (291, farther) |
| 5 | none (largest 81) | 20 | none (71) |
| 6 | 323 (8) | 21 | 408 (8) |
| 7 | 437 (2) | 22 | none (69) |
| 8 | none (149) | 23 | 155 (6) |
| 9 | none (10) | 24 | none (40) |
| 10 | 300 (2) | 25 | 186 (7) |
| 11 | none (68) | 26 | 207 (2) |
| 12 | none (240, farther) | 27 | none (2) |
| 13 | 170 (5) | 28 | 355 (8) |
| 14 | none (72) | 29 | 384 (4) |
| 15 | 1,041 (4) | 30 | 199 (2) |

No island to expand to on 12 maps: 5, 8, 9, 11, 12, 14, 17, 19, 20, 22, 24 and 27. On most of them
the islands meet the shore (where the ring breaks they may), so their land is the start's. On 12,
17 and 19 the largest island lies more than 8 tiles of water out. Nothing is changed for them:
Kyler decides.

**The badwater test's Any map** (`tests/contract/badwater.test.ts`): Any 96² seed 22 started 6 tiles
from badwater or its soil, against the 15 it asks for (`start.badwater`, a target the settler aims
for). The cause is Any's new land: Any takes the six themes' means, so Delta's new ranges moved it
(D416, D429). The rule is unchanged. On that land the settler found no start 15 tiles or more from
badwater or contaminated soil, with or without room for the mine sites, so it took the next start
its rules allow. Re-pinned to Any 23 (D148), which keeps the distance. The other themes stay on
seed 22.

### Islands: the sea's layout for the grown island (D427–D428, 2026-10-02, night): the stop

Kyler on be9b645c: not accepted. The grown island sat in a moat on seeds 13 and 17 (nearly 3), the
ring of land stood on most maps, six read as land with lakes, and 17 starts were on the mainland,
the promise down to 14. This round was to fix the sea's layout: break the ring on most maps so the
grown island lies off the middle in open water. The island start keeps 1,200 walkable tiles at
128² (D428).

- **Tried** (each 30 seeds at 128²; all passed every absolute):
  - A smaller sea where the ring breaks, 78–88% of the size: the promise on 10, many maps land
    with rivers.
  - The same with a narrow shore of 1–4% of the side: seas drained by low points on the edge, the
    promise on 8.
  - A sea 88–96% of the size, the island 40–55% of the sea's radius off its middle: the promise on
    11. This is the sheet.
  - The same with full-size seas and a strait cut round the grown island: the promise on 8.
- **The sheet:** `docs/sheets/m9b-islands-grown-1.png` (seeds 1–15) and
  `docs/sheets/m9b-islands-grown-2.png` (16–30), each map 208 px with the start marked. It is
  `investigation/m9b/islands-grown-variant.patch`, applied on be9b645c.
  - All 30 pass, the promise on 11, all three outcomes on 10.
  - The start stands in the grown island's ellipse on 17 maps. On 6 it falls back to the shore; 7
    are the edge layout.
  - By eye, though, most of those starts stand on land the island shares with the shore through a
    neck, not on an island. The promise's reading agrees: the land apart from the largest mass is
    under 2% of the land on seeds 6, 8, 9, 22, 28 and 30.
- **By eye, by seed:**
  - Starts on an island: 3, 12, 13, 16, 29, and 20 nearly.
  - An island central in a moat: none.
  - A ring of land round an inland sea: 2, 4, 5, 16, 19, 23, 25 and 29, the edge layout's 2 and
    19 among them.
  - Land with lakes and rivers, not islands: 8, 9, 10, 15, 17, 22, 24, 27, 28 and 30.
- **The stop:** this round can't put most starts on an island while keeping the promise near the
  safe version's 20.
  - An island a colony's start fits on at 128² needs, on its own land, 1,200 walkable tiles, two
    mine sites 30 tiles or more away, moist farmland, level land and wood. That takes about 1,500
    tiles and 60 tiles end to end, a large share of a sea that must stay a quarter of the map.
  - Placed off the middle, it meets the shore. A strait round it cut rivers and lowered the promise
    further.
  - The maps Kyler named as breaking the ring (3fbb21f7's 23–25, 28–30) mostly fail the promise
    reading themselves (23, 24, 25 and 28): their seas are under a quarter of the map, or their
    islands meet the land.
  - Kyler chooses between this sheet and releasing the safe version with island starts parked
    until after the release.

### Islands: one island grown for the start (D417, Kyler's third look, 2026-10-02 evening)

Kyler: neither sheet yet. The safe sheet has the variety, but the start is always on the shore. The
big-island sheet's start is on an island, but two thirds of it is one central island in a moat
inside a ring of land, and the promise falls to 16. Next: the safe layouts with one island in each
grown large enough for the start, off the centre and in a different place each seed, never a
central island in a moat. Where a layout can't hold one, the start falls back to the shore.

- **The grown island:** `investigation/m9b/islands-grown-variant.patch`, applied on f1ee8450.
  - Every layout but the edge one adds an island of radius 20–22, 1.8–2.2 times as long as wide.
    Its middle lies 12–18% of the side off the sea's own middle, at a bearing drawn each seed, and
    it lies long along that side of the sea.
  - Its top is gentler and its coast calmer. The coasts of islands of 1,200 tiles or more step up
    from the sea a level every five tiles (`gentleCoasts`, before the water is planned). A spring
    rises on its high ground first.
  - It may meet the shore. The start goes on it alone (its ellipse a quarter past its coast), with
    the walkable ground Buildable land asks for: 1,200 tiles at 128², without the eighth of the map
    larger maps add. The plan's own start is taken there when it is still dry and clear.
  - Where none fits, the start goes on the shore.
- **The three side by side:** `docs/sheets/m9b-islands-grown.png` shows safe | big | grown for
  seeds 1–30 at 128². The safe sheet `docs/sheets/m9b-islands.png` is re-rendered after the dev
  merge: all 30 pass, the promise on 20, all three on 19.
- **Grown, seeds 1–30:**
  - All 30 pass, the promise on 14, all three outcomes on 11.
  - The start stands on the grown island on 13 maps. On 9 it falls back to the shore. The other 8
    are the edge layout, whose mainland is its own place to build.
- **What stops the rest:** a start on an island needs, on that land, two mine sites 30 tiles or more
  from it on level squares clear of the water's margin (#136, item 47), 100 tiles of moist farmland
  and the Start area's level land within its walk, and its wood. The island's low coast is all
  water's margin. Most redrawn lands miss the promise once the island takes sea area, and the land
  shown after the screen's budget may hold a smaller island.
- **Tried and dropped on the way:**
  - A strait cut round the grown island through higher ground: across a river's course it left
    the water spilling and never settling, so the map failed (Islands 6).
  - A low, level plain over the whole island: its tiles fell within the water's margin and lost the
    mine sites' room.

### Delta's tuning, round 2 (D416: seed 29 still a lake, seed 23's thin water)

- The arms are 0.4 of the main river's width, not 0.6, so each carries its share deeper.
- The floor the rivers clear is 1–4 tiles wide each side, not 2–8. On seed 23 a broad floor at the
  banks' level took the water of the rivers that join on it as a thin sheet.
- A Delta never draws "A large crater gathers two or more rivers": the crater took the water the fan
  needs, and its flat floor stood under a thin sheet (seed 23). This is a default Kyler can overrule.
  Any's weight for it is the six themes' mean, so Any moves too.
- Seeds 1–30 at 128²: all pass, the promise on 25 (was 22), all three outcomes on 19 (was 17).
  Thin water across the 30 maps: under 0.1 deep, 15,922 tiles before, 8,269 after; 0.1–0.3 deep,
  30,060 before, 23,461 after.
- Seed 29 now fans out to its eastern edge, past the crater rim at its south. Seed 23 is a different
  land now: its rivers join in a broad stream 0.1–0.3 deep, and a small lake drains at its western
  edge under 0.1.
- The sheet: `docs/sheets/m9b-delta.png`.

### Islands: the ring broken, and the big-island sheet (D417, after Kyler's look at 3fbb21f7)

Kyler at 3fbb21f7: the rectangles and the square frame are gone, but about two thirds of the seeds
read as one layout, an inland sea in a ring of land. That may stay on at most one map in four; the
rest should break the ring, as seeds 23–25 and 28–30 did. The start belongs on an island: he
decides from a big-island sheet beside the safe one.

- **The ring broken** (`genome.ts` `seaRing`): a sea map draws an inland sea in a ring of land on
  one map in four, and the edge layout keeps its own coast. On the others the sea lies off the
  middle, by 8–14% of the side. The land round it is broad on one side, where islands drawn there
  join it as peninsulas, and narrow on the other. Three or four broad headlands also reach into the
  sea from that land, at spread bearings. Their high ground is an island's, so the shore is land
  and channels, and islands may meet it. There the straits that stood islands clear of the shore
  (D350) are cut only round an inland sea.
- **Tried for the ring, not kept:**
  - Two to four straits from the sea to the edge (3–5 or 8–14 tiles wide): their thin water read
    as pale lines, and the ring stayed.
  - A lower sea (the hydrology fitting it to about a third of the map): little visible change.
- **The safe sheet**, `docs/sheets/m9b-islands.png`:
  - all 30 pass, the promise on 20, all three outcomes on 19;
  - the start is on the shore, as before;
  - by eye, about eight of the 30 still read as a sea in a ring, the edge layout's among them.
- **The big-island sheet**, `docs/sheets/m9b-islands-big.png`: built from
  `investigation/m9b/islands-big-variant.patch`, applied on 3fbb21f7. Not adopted: it is for
  Kyler to decide the start.
  - Each layout has a main island of about 2,500–3,700 tiles. It is near round, with a gentler top
    and lower spine and peaks, and its coast rises from the sea in steps of a level every five
    tiles, so it is moist and walked without stairs (`islands.ts` `gentleCoasts`, before the water
    is planned).
  - Round an inland sea, its strait is cut past its coast and through higher ground too, wandering.
  - The ring breaks as above. The start keeps off the land within 14% of the side of the edge, an
    island that reaches the shore keeping its land further in.
  - Seeds 1–30: all 30 pass, the promise on 16, all three outcomes on 15.
  - 26 of the 30 starts stand 18 or more tiles in from the edge, on an island or a headland joined
    to one. Three stand on an island clear of the shore. The rest are on the edge layout's coast.
  - The promise reads fewer islands where they meet the shore, which this round allows.
  - Lands are drawn again more often before one is shown (up to 13 times).
  - Some seas stand thin over broad flats (seed 5: 2,651 tiles 0.1–0.3 deep; seed 10: 2,355 under
    0.1).

### Islands' second shape round and Delta's tuning (D416, D417, 2026-10-02, evening)

Kyler's verdict on the first sheets (3d2d89ea): Delta's shape accepted, with two tuning notes
(D416); Islands needs another shape round (D417). The sheets, each seed at 128² beside M9a's:
`docs/sheets/m9b-islands.png`, `docs/sheets/m9b-delta.png`.

- **The rectangles were land, not the soil rule's moist patches.**
  - Seeds 3 and 20: the sea's way out. `widenOutlets` cut a band up to 41 tiles wide to the edge,
    every tile of it down to the level of the route beside it, so a route through a deep channel
    left a box canyon with straight walls.
  - Seeds 14 and 26: the slow regional field's value-noise lattice. Its straight creases showed on
    the sea's broad flat floor and along its shore.
  - Now, on a sea's map, the regional field's lattice is warped. The way out winds more, and its
    banks wander from half to one and a half times its half-width. Off the route's own channel it
    is cut no lower than a level under the sea's (`levels.ts` `widenOutlets`, `organic`). The keep
    round a river's head there is round, not a square.
- **The sea's outline:** the rim's inner line is a rounded square, so there are no square corners.
  Its distance from the edge wanders from about 1% of the side to 8%, with narrow headlands up to
  3% further in. Its fall to the sea runs from a cliff to a gentle shore (`field.ts` `rimKeep`).
- **Fewer, larger islands:**
  - one large island: the big one 19–24, two to four others (was three to six);
  - a scatter: four to seven islands (was six to ten), the first 14–18;
  - a chain: four to six islands, 6–17 each;
  - an atoll: ten to fourteen broad pieces with relief of their own (was 18–25 islets);
  - two large islands: 15–20 each, with one or two small ones;
  - a sea off one edge: three to five islands, 6–14 each.
- **The start on an island (D411, D417):**
  - The settler tries the islands first, every way. On the planned water, land at the sea's
    level counts as the sea's, so a strait the sea will fill no longer joins an island to the
    shore. The start made ready as the land was shaped is used when it stands on an island.
  - It still lands on the shore on all 30 maps. A start needs ground joined by steps of one level
    or less over 12% of the map (1,966 tiles at 128², PLAN §5.2). It also needs its two mine
    sites 31 tiles or more from it (item 47's 24 with the margin), on the same island (D411).
  - So the start's island must be 60–70 tiles across and about 2,500 tiles. This round's largest
    islands are 1,000–1,600.
- **Tried and not adopted:** a main island of about 2,500 tiles in every layout (rounds 9–19).
  - What worked: starts moved onto islands, and the islands read as places to build.
  - What failed: the big islands touched the rim, and the promise reading (three separate
    islands, a quarter of the map under the sea) failed on 10–12 of 30.
  - Lands were drawn again 7–20 times before one was shown. Some seeds lost their sea.
  - One map per round failed an absolute: no start, unsettled water, the mine sites.
  - Also tried: larger seas round the islands.
  - Kyler to choose: big islands with the start on them, at that cost; or these islands, with
    the start on the shore at 128².
- **Islands, seeds 1–30 at 128²:**
  - all 30 pass, the promise on 23, all three outcomes on 21;
  - layouts: a scatter 12, one large island 5, a sea off one edge 5, two large islands 4, an
    atoll 2, a chain 2.
- **Delta (D416):**
  - Every arm is made. The arms and the main river's own mouth stand at evenly spaced slots
    across the fan, at least 14 tiles apart at 128². Before, an arm near the main mouth was left
    out, and seeds 8, 15, 19, 28 and 29 read as one river.
  - The arms wander as rivers do.
  - Lakes cover up to 15% of the map (was 30%). Seed 4's lake filled a quarter of the map and
    stood a few hundredths deep over the flats at its sill: tiles under 0.1 deep went from 2,491
    to 206.
  - Seeds 1–30 at 128²: all pass, the promise on 22.
  - Seed 29 still reads more as a lake than a fan. Seed 23 keeps its thin water (1,012 tiles
    under 0.1, 1,020 under 0.3): a crater lake on a flat floor at its outlet's level, not yet
    fixed.

### Islands and Delta redesigned, the shape first (D407–D412, 2026-10-02)

Kyler's review (D407) found each theme one map with minor differences, worse than M9a. D370's two
templates are gone (D408): `land/archipelago.ts` and `land/delta.ts`, with `generate.ts`'s island
stage, its start rule and its badwater rule for Delta. Both themes now come from the field's own
processes (uplift, erosion, terraces, relief noise, drainage, the water), like every other theme.
The sheets, each seed at 128² beside M9a's (dev's 0.7.0), for Kyler's eye before any outcome counts
are tuned: `docs/sheets/m9b-islands.png`, `docs/sheets/m9b-delta.png`.

- **Islands** (D409–D411; `land/genome.ts` `addSea`, `land/field.ts` part `isle`):
  - D209's six sea layouts are the starting points, each drawn with its own ranges: one large island
    with three to six smaller ones round it; a sea off one edge with three to seven islands off the
    mainland; a scatter of six to ten mid-sized islands, kept apart, the first big enough for a colony;
    a chain of five to seven along an arc, largest in the middle; an atoll, a lobed ring of islets
    with one to three passes and sometimes a high islet in the lagoon; two large islands parted by a
    strait, with up to two small ones. On seeds 1–30: scatter 12, chain 5, edge 4, atoll 4, two islands
    3, one large island 2 (the scatter passes first time more often than its weight, 0.24, says).
  - Every island has relief of its own: a new `isle` part (a warped ellipse with bays and headlands, a
    ridged top, steep flanks into the sea), a spine along it and one or two peaks, so the erosion cuts
    valleys down it, the terraces step it and springs rise on it. The sea's bowl tilts 3–4 levels
    (the edge layout 6–7.5) and its relief noise is halved, so the islands stand out.
  - The sea's rim is half as wide (5% of the side): a shore along the edges. A sea still needs dry
    land at every edge (the game drains every edge tile), so only the edge layout has a mainland.
  - The sea's shelf at its spill level rises a level and is dry (`raiseSeaShelves`, groups of 8 tiles
    or more): no pale sheet a few hundredths deep round the islands (seed 4: 3,000 tiles under 0.3
    deep before, 1,000 after).
  - Starts (D411): on a sea map other than the edge layout, when an island of 1,500 tiles or more
    (at 128², in proportion to the area) stands clear of the edges, the settler tries the islands
    first, any island that holds what the start needs; otherwise the shore.
  - A sea map never draws Hanging valleys or Farmland past a gorge (`intentions.ts` `DRAINS_A_SEA`):
    both cut the main river deep, and on a sea map that river is the sea's way out across its rim;
    cut deeper it drained the sea (seeds 8, 10 and 12 in the sixth round had no sea).
  - Seeds 1–30 at 128²: all 30 pass, the promise on 30, all three outcomes on 24.
- **Delta** (D412; the Delta preset, `land/hydro.ts`'s delta):
  - Relief across the whole map: the preset's tilt 1.6–4 levels (was 0.4–2.8), its linear share 0.55,
    relief noise 3–6 (was 2–4.5) on 24–56-tile cells, ridged up to 0.35. The river comes down from
    higher ground.
  - The fan is the map's own: its apex anywhere from a third to two thirds down the main river, three
    to five arms (one more with Braided), spread over a fan 0.7–1.5 times the reach below the apex
    (24 tiles to 0.8 of the edge), leaning to a side; an arm too near the main river's own mouth is
    left out. Other themes' fans are unchanged.
  - Seeds 1–30 at 128²: all 30 pass, the promise on 22, all three outcomes on 18.
- **Any moves too**: its ranges are the six themes' mean, so the Delta preset moves it, and its sea
  maps take the new layouts.
- **Tried and dropped**: larger seas (radius +0.12 of the side: the promise on 18 of 30, two maps lost
  their sea, the larger floors stayed dry); Delta with two or three arms each as wide as its share of
  the water (the promise on 17, the fans read as one broad river).
- **Left for the tuning, after Kyler's look**: most starts still stand on the shore round the sea;
  thin water across part of the fan on Delta seeds 4 and 23 (seed 4: 2,000 tiles under 0.1 deep);
  the layouts' shares; outcome counts; the 840-map measures; the timings (D414); the re-pins. CI is
  red on Islands', Delta's and Any's pinned maps until then.
- On the sheets, the straight-edged green patches on flat shore are moist ground: the game's soil rule
  spreads moisture a fixed distance over level land (D298); the land itself has no straight edges.

## Hand-over (2026-10-01): where M9b stood, and how to resume (history: the hand-over above is current)

Written for a session with no memory of this one. Branch `feature/m9b`, draft PR #70 into `dev`, never
merged by Claude. The round's full account is "Mine-site pads (D363, 2026-10-01)" below; this is
the state and the next steps.

### The tip, and what is in it

The code is at `13d1f1a2` (later commits are documents and tools). In it, newest first:

- a dam wall on the pre-fill's water 0.2 deep or more redraws the land before it is shown (13d1f1a2);
- "reached" as one function (`colonyReach`, `minesReached`, D342), the debris before a second
  district kept off the way to the mine sites, a land's planned lakes read alone for straight banks;
- D373 (3): every start a shown land may use has its pad and its mine sites' room ready (62858d54);
- D373 (1): a channel below each confluence as wide as the water it carries (a69c9f11);
- D370's adoptions, one at a time: Islands' sea-first shaping (3aedffce), Delta's plain and braids
  (1b77d40f), River Valley's own shaping (cd5d5bf4). **Held:** Canyon, Highlands, Lake Basin (their
  audits are Codex's; nothing of theirs is adopted) and the settings prototype, last. Codex's
  settings round 2 starts from a69c9f11 or later;
- D348 as D370 has it (every shaping step before the first land is shown, but D350's worn way
  out), D369 (Islands' water cap 0.70, islands in a lake hold objects), the mine-site pads (D363),
  the faster settle (D359, merged in from `dev`).

D372's sheet rule and D373 (2)'s fill time are readings only (`info.sheet`, `info.rise`); neither
rejects anything. Other readings: `info.lakeStraight`, `info.preWet` (a poor predictor of the
settled share, off by −0.21 to +0.41: don't build a flood check on it).

### The last measure (13d1f1a2, 840 maps: seeds 1–40, seven themes, three sizes)

Failing an absolute: **2 at 96², 0 at 128², 0 at 256²** (D350: zero before release). First maps
meeting all three outcomes, of 280: 213, 228, 229. Per theme, seeds 1–20 (the target is two-thirds,
14 of 20), with the outcome missed most:

| Theme | 96² | 128² | 256² |
|---|---|---|---|
| Any | 19, water (1) | 18, water (2) | 17, water (3) |
| River Valley | 19, water (1) | 18, promise (1) | 16, water (3) |
| Canyon | 11, promise (5) | 15, water (4) | 15, water (3) |
| Highlands | 9, promise (8) | 15, promise (5) | 17, promise (3) |
| Lake Basin | 12, promise (8) | 13, water (6) | 12, promise (7) |
| Delta | 19, standout (1) | 18, standout (2) | 17, standout (2) |
| Islands | 19, absolute (1) | 20 | 20 |

Under the target: Canyon 96², Highlands 96², Lake Basin at every size. Median time to the map
2.2 s, 2.8 s, 9.0 s. The rows are committed: `investigation/m9b/baseline/13d1f1a2-*.jsonl.gz`.

### The failing maps, their causes, the planned fixes (in the order agreed with Kyler's planning chat)

1. **Fixed (13d1f1a2): Any 96² seed 18, Lake Basin 128² seed 5, a dam wall on the settled water
   only.** The river arrives lower than a planned lake's bed (its bed 3, the lake's tiles 6–8);
   8750c300 cuts its channel through the lake's tiles; the floor the river clears beside its
   channel (a level over its bed) skips lake tiles, so the lake's old bed stands between the channel
   and the floor as a band of rock with the river through it. The plan (`plannedWater`) counts the
   lake full, so the check before the land is shown read those tiles as water and passed.
   - **P, as built:** the check also reads the pre-fill alone, the water the settle starts from,
     with its water under 0.2 deep left out; a wall there redraws the land
     (`tests/contract/drainedLakeWall.test.ts`). Counted before it rejected anything: it flags those
     two maps and no other of the 840. Making the plan's own estimate true, tried first, does not
     work: a tributary across the old lake bed reads as wet on any plan and settles dry.
   - **L, a trial still to run, with a full measure against this tip** (absolutes, all three per
     theme, which maps moved; keep it if clearly better, P stays as the net): the feature's bed
     profile shows the bed rising again at the lake's outlet (3 through the lake, 8 at its outlet
     on Any 18), so the lake should hold. It drains because the floor along the lake stretch, and
     along the reach above it, is cut a level over the *channel's* bed (4), far under the lake's
     level, and lets the water round the outlet. This is likely why planned lakes settle smaller
     than planned in general (the reason `plannedWater` has `held` at all), and may be part of Lake
     Basin's 12 of 20. The trial: in `land/hydro.ts`, cut the floor no lower than a level over the
     level the water must reach to leave (the running maximum of the bed downstream, which the
     feature already computes as `env`), instead of a level over the bed.
   - **Tried and dropped:** a reading of dam walls from the land alone (33 false flags in 840, misses
     Any 18); clearing the floor through the lake's tiles (`patches/lake-floor.patch`: fixes both
     maps, but River Valley 256² seed 37 then never settles, River Valley 96² seed 1 floods to 36%,
     Lake Basin's all three at 256² fall 12 → 8); a cap on a joined channel's width.
2. **Any 96² seed 31, Islands 96² seed 4: the 96² start class.** The settled water moves the start
   off the plan's, and the start then used has no room for two mine sites 24 tiles out (Islands 4's
   island is about 20 tiles across). Two places judge that room by different rules than the placement
   does (D342: one function):
   - `gen/extras.ts` `roomFor` (the pair's reservation) reads a square's distance at its corner;
     `resources/baseline.ts` `pickMineSite` asks the footprint's nearest tile to be 23.5 out. Make
     `roomFor` ask the same.
   - `land/minePads.ts` `roomMap` (which starts have room, on the settled water) keeps off less
     than the placement does (`extras.ts`'s `blocked`: lake beds, the map's border, the water's
     margin as a square). Give both one keep-off mask.
   - Then, the planning chat's suggestion: plan the start only where its land can hold the pair
     24 tiles out (on Islands, an island big enough), or draw the land again before it is shown;
     **measure the cost before it rejects anything.**
3. **Highlands 96² seed 14** passes by the order of its attempts only: three of its
   starts in turn lose their water once it settles. Same class as 2; unaddressed.

### Open from D370 (2), not started

- **The Canyon signature's separate effect:** a 60-map Canyon run (seeds 1–20 at the three sizes)
  with the signature reading as it was before `tests/unit/canyonSignature.test.ts`'s change against
  the tip, to say how much of Canyon's promise moved because of it.
- **256² speed for Any, Canyon, Highlands, Lake Basin:** profile first (`investigation/m9b/speed.py`
  reads the measure's times; a CPU profile of `generate` on the slowest seeds), byte-identical
  changes where possible, and report the profile before any change that moves a map.

### Tests red on the branch, and why

CI at cc161b3a (the last finished run when this was written; check 13d1f1a2's): `oracle` and browser
shards 2 and 3 pass; red:

- **`generation`**: Lake Basin 128² seed 5 failed (the dam wall, fixed since); the job wants final ≥ 98%.
- **`test`**, 16 tests in 11 files, all pins or seeds of maps that moved this round (D148: re-pin or
  re-seed each to what its name says, once the counts settle, and note it under "Tests updated
  because a decision changed what they tested" below; never weaken one): `brush` (a one-tile pit;
  a ramped Flatten on a map), `carve` (an oxbow lake's water kept), `look-mine-ruins` (the map's
  bytes), `look-waterfalls` (Highlands 5, Lake Basin 3), `narrows`, `objects` (ruins on a rise, a
  second district's site, a generated weir, a plugged spillway), `parity` (Lake Basin 128² seed 5:
  the map that failed, fixed since), `projects` (an outline past the edge), `resources` (the official
  amounts), `startPlanting` (no two starts alike), `versions` (the background search's sibling).
- **browser shards 1 and 4**: `tests/e2e/editor.spec.ts:20` and `tests/e2e/waterView.spec.ts:18`,
  seeds whose maps moved.

Green and new this round: `tests/unit/colonyReach.test.ts`, `minePads`, `plannedWater`,
`drownedHeads`, `riverSheet`, `waterCap`, `canyonSignature`, `storyPlug`; `tests/contract/`
`districtDebris`, `lakeBanks`, `drainedLakeWall`, `lakeCourse`, `firstLand`, `lakeIsland`, `minePair`
(`firstLand256` is in the heavy suite). The contact sheet (`docs/sheets/`, D144) is due again once
the maps settle.

### The measure tooling

Once per machine: `npm ci && npm --prefix investigation/probe ci`.

- `sh investigation/m9b/measure.sh <name> [jobs] [seeds]` runs the 840 maps from a frozen copy of
  `src/` (edit freely while it runs) into `investigation/m9b/local/measures/<name>-<size>.jsonl`
  (gitignored, D195). About 27 minutes with 6 jobs on the machine this was built on: 5, 7 and 15
  for 96², 128², 256². One heavy run at a time.
- `python investigation/m9b/share.py <name>`: the table above. `python
  investigation/m9b/compare.py 13d1f1a2 <name>`: failing maps, lands changed, all three gained and
  lost, against the committed baseline. `python investigation/m9b/summary.py <file>…`: failures
  with their last attempts, fixes used, times, pads, worn ways out.
- `npx tsx investigation/m9b/tools/trace.ts <theme> <seed> <size>`: one map, attempt by attempt.
- A row's fields are `MapMeasure` in `investigation/m9b/measures.ts`.

### Only on the machine it was built on

Everything needed is committed. Left behind in `investigation/m9b/local/` (gitignored): the runs
p1–p25 (p25 is the committed baseline; regenerate any with `measure.sh` at its commit), and
throwaway probes of single maps, each a few lines round `generate` with a temporary hook. Nothing
there is needed to resume.

### First, on resuming: merge `dev`

The forces were released (`forces-done`), so `dev` now holds all of `feature/forces`. This branch
has not merged it (it would have moved the measure's base at the session's end). Merge `dev` into
`feature/m9b`, run the measure and `compare.py 13d1f1a2 <name>` (the generator's maps should not
move; say which do), then fold `resources.mine_reach` (the forces' editor-only advisory, #146,
D368 (10)) into `resources.mine_site`, so there is one check, read with `colonyReach`; it keeps
its editor-only advisory behaviour for edits.

### Waiting on Kyler

`docs/decisions-pending.md` #149 (amended), #151, #154 (D363's choices). The DGM Probe has not run
on this round's maps; a batch is the planning chat's to ask Kyler for, never launched from here.

> **Hand-back note (D333, M9b's answers; 2026-09-29; history: the hand-over above is current).** Branch `feature/m9b` (draft PR #70). Batch 5
> (D325) is in, and the pooled probe ran on Kyler's yes (m9b-20260929b: 14 of 18 maps pass everything;
> the two Sources: None maps' water check fixed; the refill gap explained, below). D333's answers are
> built: the land kept once it passes (speed), first maps' quality, one note for a missed promise,
> the nightly settings' verdicts and re-bases, item 47 scaled below 80², the Sources setting in
> PLAN §5, `walkReach` and `levers` in the worker's response (#92). CI green on c95d84ba; the nightly
> settings experiment passes 32 of 34 locally (Verticality and Lakes and basins still weak). Next: the
> release candidate (the batches, the review set). Defaults this session chose: decisions-pending
> #135–#149 (#135, #144, #146 settled by D333).

Kyler's decisions: PLAN §20 D252, D273–D278, D282, D286, D294 (the starting list from M9a's review
set), D298 (the game's own soil rules). The yardstick: `docs/PERFECT.md`'s "Maps", "Water" and
"Challenge" (Challenge's terrain difficulty is deferred, D276).

## Batch 5 (D325): the forces-preview feedback's items 47, 36, 26, 27, 22, 21, 24

Measured with `investigation/m9b/measures.ts` (seeds 1–10 of every theme at 128², the cycle model
for badwater; results in `investigation/m9b/local/measures/`, ignored).

- **Step 1, the height budget (items 47, 36).** The land stands on a floor: every level moves up
  by `BED_FLOOR` (3) and the relief is squeezed only where it would pass the ceiling
  (`genome.ts` `leanGenome`); no cut goes below it (the river profiles, pools, oxbows, outlets,
  badwater pits, and a clamp before the course check). Deepest bed per theme 0 → 3. Highest
  terrain is a cap on every map, 10–22, its default following Verticality (16 / 22; #139); at
  Verticality 70+ spikes, walls and trenches one or two tiles wide standing two levels out go
  (`levels.ts` `readable`; #140). Verticality 100 maps reach 17–22.
- **Step 2, the trees and the start (items 26, 47).** Living trees only count toward the tree
  budget (#141): dead trees per theme (sum of 10 maps) Any 12,620 → 18, River Valley 12,336 → 25,
  Canyon 10,014 → 29, Highlands 11,161 → 120, Lake Basin 12,696 → 133, Delta 15,571 → 63,
  Islands 13,032 → 34 (the start's fallback, the floor's dry wood, one drought-killed grove on a
  third of maps); `resources.trees` counts living trees against the official living share. Two
  mine sites the colony reaches (#136), Hard's berries 30 (#137), the start's farmland and level
  land on its walk (`start.farmland`, `start.level_land`; #138; the walk's numbers are
  `analysis.walkReach`, item 24's with them), the settler's land on the settled water. Badwater
  contained (#142): land it reaches before the badtide, median per theme 96–361 → 71–144 tiles;
  none reaches the start's water or farmland. The new intention `district-behind` (#135).
- **Step 3, item 27.** `src/core/water/edgeLip.ts` (callable, with its README section and
  `tests/unit/edgeLip.test.ts`): the edge tiles an edge row's water would reach stand a level above
  it. The course check seals only a mouth's own tiles (a wider seal hid the leak), the lip holds a
  lake's shore at the edge too, and badwater ditches keep out of its reach (one carried a whole
  river off the map). Maps losing over 5% of a head's water off the map beside its row, seeds 1–10
  of every theme at 128²: 18 of 70 → 0.
- **Step 4 (D329, replacing the step as written).** The first map that passes is the map
  (`generate`), never swapped; its outcomes decide a background search (`gen/versions.ts`: up to 6
  siblings, a worker of its own) for a version meeting all three, offered under Generate with a
  short note (#143; misses that notify #144); "Looking for a better one" retired. Speed: mouth
  tiles and path fields no longer sweep the whole map (the path field is the same bit for bit),
  drainage reused across pit candidates, far badwater kept (#145), the bank start's land 800
  tiles. One map at a time on this PC: to the map 128² median 1.7 s (p90 4.9), 256² 11.1 s (p90
  25); first maps meeting all three 39% and 34%; targets proposed in #146.
- **Step 5, the one re-pin (D308, D148).** The quick suite green (782 passed, 13 skipped); every
  change under "Tests updated" below. The Python validator (`prototype/playability.py`) takes the
  new checks (two reachable mine sites, the start's farmland and level land, living trees in the
  amounts) and Hard's berries, so the real places' parity holds; item 47's start land is a known
  shortfall for real places (D331: a preference there). CI's browser specs moved to batch 5's maps
  too (seeds and names), and the attempt cap is 16 (Lake Basin 128² seed 19 passed only after 12).
- **D330's two generator pieces.** Sources: Placed · None (`so=n`; the water section's Sources):
  None is the map as generated, then its features' sources and their water removed (the field's
  `dry`, which also plants the trees and bushes where the soil was moist as generated); its water
  checks say "No water source" as information until a source runs (`tests/contract/sourcesNone.test.ts`).
  The automatic water fix (`src/core/doc/waterFix.ts`, callable as `waterFixOps` in the worker's
  session): a spring by the start, tried on a copy and settled, when the start's water, berries or
  farmland fail after edits (`tests/contract/waterFix.test.ts`).
- **Step 6, items 24's and 47's numbers as data** (no display until "The page is the editor"):
  `analysis.walkReach` (trees within the floor's 40-tile walk and the logs they hold; the start's
  farmland and level land within 20) and `analysis.levers` (farmland, the nearest metal, the
  nearest badwater, the shortest dam within 40 tiles that stores the drought's need, buildable
  land), all from the start's one walk (`tests/contract/levers.test.ts`).
- **State at the hand-back:** CI green on `99adfc2f` (test, oracle, generation, the four browser
  shards); the contact sheet `docs/sheets/m9b.png` remade. Not yet: the heavy settings experiment
  (nightly) fails 10 of 34 on this branch, each a setting that moves its target less since batch 5:
  Relief (the land squeezed under the ceiling on the beds' floor), Forest density (living trees
  only), Badwater distance, the start's badwater rule and Designed for (far badwater kept, #145),
  Berries near start, Lakes and basins, Waterfalls, Mine sites, and one Verticality map failing a
  check; their targets want deciding (D148) with the release candidate's batches.

## D333: M9b's answers (Kyler, 2026-09-29)

### The pooled probe (D308 (2), D333 (1)): run m9b-20260929b, on 7695e6a8

18 maps (the catalog's `M9b` group: two per theme at 128², two chaos maps at 256², two with
Sources: None), played with Kyler's installed mods on his yes; the restore was clean (only Steam's
`steam_autocloud.vdf` changed). Results in `C:\dgm-probe\results\m9b-20260929b\`. **14 of 18
pass every check** (load, objects, water, terrain, cal-timeline, drought-start-water,
m9a-badwater), both chaos maps with them.

- **The two Sources: None maps "failed" water on 0 of 0 wet tiles** (the game and the model both
  dry): the check read an empty map's volume as a failure. Now a map dry in the file and in the
  game holds, and water on one side only fails (`compare.ts` `waterHolds`, with a self-test).
- **River Valley 128² seed 2 and Lake Basin 128² seed 2 fail cal-timeline after the drought's
  refill** (day 7 on): wet tiles, judged as D297 judges them, 646 in the game against 679 in the
  model (5.2%) and 3,159 against 3,412 (7.6%); the water 3.4% and 3.5% apart. Both agree through
  the drought. Tile by tile (`investigation/m9b/local/refill.ts`), every extra tile of the model's
  lies in a thin sheet on a flat standing level with the water: River Valley's 728 tiles of the
  level-4 flat round a tributary running on that flat (its bed the flat's level, its surface 4.04–
  4.26; the file had 0.039 there, the game 0.044 or dry, the model 0.060); Lake Basin's level-7 and
  level-8 shelves under a lake at 8.07 (the file 0.075–0.098, the game dry, the model 0.08–0.10).
  Such a flat has two steady states under the game's spill threshold (a dry tile of the same floor
  takes water only when the water beside it stands 0.1 higher): wet if it was wet, dry if it dried.
  The drought dries it in both; on the refill the model re-wets it and the game mostly doesn't,
  hundredths apart in a transient: D311's known weak spot, thin sheets, not a water rule. What a
  player sees is the game's: water on those flats at the start that the first drought takes for
  good. Thin sheets (under 0.1 deep over 20+ tiles of one level, `sheets.ts`) are on 59 of 70 first
  maps at 128² (River Valley's median 1,310 tiles), and were on 52 of 70 before batch 5. The fix
  belongs to the generator (no flat level with a water surface), not the model; below.
- The runner's self-test: the High terrain group's test mesa covered Highlands 4242's start (moved
  by generator 0.8.0); the mesa now stands at the first of a few places 30+ tiles from the start.

### Speed: time to editable land (D333 (2))

- **The land is kept once it passes its own stage** (`gen/generate.ts` `planLandStage`): its rivers
  planned, their courses checked, and a start on the water they were planned with (a land with no
  place for one is drawn again before any settle). The first look (`onLand`) fires then, once per
  land. What fails after it is planned again on the same land, up to `LAND_TRIES` (2), keeping off
  the starts that failed; only a failure bound to the land (water that never settles, no start on
  its settled water) draws new land. A river whose row of sources another's water reaches leaves,
  as a reached spring does.
- **No flat level with the water beside it** (the pooled probe's refill, above): a lake's shelf at
  its spill level is cut a level lower at the land stage (no extra settle; not round a sea, whose
  shelf cut down fills for days), and a tributary runs a level under a floor a bigger river cleared,
  where it ran on the floor as a sheet (`land/hydro.ts`). Thin sheets on seeds 1–10 of every theme
  at 128²: median 251 tiles a map → 167; failed attempts 177 → 117 in that run.
- **Times** (seeds 1–10 of every theme, six maps at a time on the shared machine, median / p90;
  before: 7695e6a8, run the same way earlier the same day):

  | | before | after | D333's target |
  |---|---|---|---|
  | 128², the land | 0.4 / 5.6 s | 0.5 / 4.9 s | |
  | 128², settled water | 2.2 / 7.2 s | 1.8 / 6.2 s | |
  | 128², the map | 3.0 / 7.9 s | 2.5 / 7.1 s | 2 / 5 s to a settled map (accepted) |
  | 256², the land | 1.9 / 20.2 s | 1.8 / 13.3 s | 3 / 6 s |
  | 256², settled water | 8.5 / 24.7 s | 7.1 / 23.0 s | 8 / 20 s |
  | 256², the map | 11.0 / 26.4 s | 9.5 / 25.2 s | |

  The medians meet D333's targets; the 90th percentiles at 256² don't: a land drawn again after its
  water failed to settle (11 of 70 maps, most of them Islands' seas) or after its settled water left
  no start, and one Any map that took 14 attempts (133 s). Lands shown and then drawn again: 19 of
  70 at 128², 15 at 256².

### First maps meeting all three outcomes (D333 (3))

Seeds 1–10 of every theme (before: 7695e6a8):

| Theme | 128² before | 128² after | 256² before | 256² after |
|---|---|---|---|---|
| Any | 7 | 9 | 7 | 7 |
| River Valley | 1 | 4 | 4 | 6 |
| Canyon | 7 | 5 | 4 | 6 |
| Highlands | 3 | 5 | 2 | 5 |
| Lake Basin | 3 | 5 | 2 | 1 |
| Delta | 4 | 3 | 3 | 3 |
| Islands | 4 | 7 | 5 | 7 |
| All | 29 of 70 | 38 of 70 | 27 of 70 | 35 of 70 |

What changed, first-attempt quality and no more attempts: the tributary under a cleared floor and
the lake shelves (above; River Valley's water split into systems at its junctions); the story is the
clean water's, badwater contained by item 47 left out of it (#148); springs where the planned
courses leave the land beyond the story's reach, one river of its own allowed when none joins (not
with Generous buildable land or a Drought reserve moved from the theme's, which plan that land and
water themselves); River
Valley always has an inflow, and a map with none looks again with shorter paths; Islands' sea 1.12×
as big and its islands 1.15× and at least 2.5 levels up (#149). Two-thirds is not reached. What
misses most: Lake Basin's and Delta's promise at 256² (lakes under 4% of the map, fewer than three
mouths: their lakes and arms spread on the flat low ground the beds' floor leaves), Canyon's (a gorge
long enough but under a fifth of a long river), Islands' (fewer than three islands on some sea
layouts), River Valley's water (a spring-fed map whose inflow edge lies below a ridge: its water
reaches a fifth of the land).

### The nightly settings experiment (D333 (6))

Ten of 34 failed at batch 5's hand-back. Each, run at seeds 1–4 at 96² as the nightly runs it, on
the generator before batch 5 (00b39b56), at batch 5's hand-back (7b6eba7e) and now:

| Setting | Verdict |
|---|---|
| Relief | Still changes the map (the height range 9.5 → 11.5 levels, and its cliffs), less: the base raise (item 47) leaves 12 levels under the editor's 16 where there were 15. **Re-based** (D148) to 2 levels. |
| Verticality | **Weak, not fixed.** It still sets the height (17–22 from 70) but no longer the cliffs' share: 16 seeds, 0.034 before batch 5, 0.023 at its hand-back (the base raise, the readable land at 70+), ≈0 now (D333's cut channels and lakes add cliffs at every Verticality). |
| Lakes and basins | **Weak, partly fixed.** Short before batch 5 too (2.7 of 3); the beds' floor flattened the lowest basins (1.5); the setting's basins now dig 1.6× as deep (2.5–2.8). |
| Waterfalls | Changes the map as its target asks (2.8 of 2.5 now). |
| Badwater distance | Moves the badwater 8 tiles where it moved 35: item 47 keeps a pit off the lowest ground and prefers short ditches, so at 20 the badwater stands about 40 tiles out. **Re-based** (D148) to 6 tiles; the start rule's own distance and Designed for pass. |
| Forest density | Changes the map as much (×2.9, 50% → 200%); the counts are a third since item 26 counts living trees. **Re-based** (D148) to 250 trees. |
| Berries near start | Passes now (34 → 88). |
| Mine sites | Item 47's minimum is two: **re-based** (D148) to 2 → 4. |
| Start rules: no badwater within | Passes now (moved 20–35). |
| Designed for | Passes now (moved 17). |

D333's own first cut weakened three more, all fixed: Buildable land (the springs added toward far
land cut Generous's flats: none where the player asks for Generous), Drought reserve (small lake
shelves cut, and the added springs, drew starts to water or away from it: shelves of 60+ tiles only,
and no added springs where the reserve is moved from the theme's; and the experiment runs 12 seeds,
since one map's natural storage runs from 0 to 3,500 and four seeds measured which map drew a big
lake: 235 moved on 12) and Rivers (a count the player set failed within 24 attempts on one map: no
added springs where the player set the Rivers count).

### 48² maps (D333 (7))

Maps under 80² (`SMALL_MAP`, #147; Kyler named 48²) need one mine site the colony reaches, and never
draw the district-behind-an-obstacle intention; the starting-logs floor and the other absolutes
stay (the Python validator the same). Seeds 1–10 of every theme: 48² passed 23 of 70 within the
attempts before, 39 after; 64² 57 → 67. What still fails at 48² is no start (a 5×5 of level, dry
ground by water within the rule's walk), on the M9a generator too (8 of 35): the land's shapes are
too large for a 48² map, a question for the land's scale, not item 47.

### Items 24's and 47's numbers reach the page (#92)

The worker's `GenerateResponse` carries `walkReach` and `levers` (the shapes of
`PlayabilityAnalysis`, which "The page is the editor" part 1's map card mirrors) for every map it
sends: a generated one, a version the background search found, a sibling, an edited document
(`tests/contract/levers.test.ts`).

## D348 and the probe's refill gap (2026-09-29, night)

### The refill gap: the game's rule, and what the model misses

- **The rule** (`Timberborn.WaterSystem` `OutflowsUpdateTask.GetOutflow`, read-only): water flows
  from a column to a neighbour by 2.25 × dt × the head difference plus 0.999 of last substep's flow;
  where no dam limits it and the neighbour is dry (`WaterDepth + Overflow == 0`) on the same floor,
  the head difference first loses `WaterSpillThreshold` 0.1. So a sheet spreads onto dry ground of
  its own level only where it stands more than 0.1 above it. The drought ramps (`DroughtWaterStrength
  Modifier`), the evaporation (0.001/s under 0.02 deep, else 0.0001/s, times the cluster saturation's
  modifier), the source step and the task order are the model's too, line by line.
- **One misalignment, fixed** (`investigation/probe/runner/model.ts`): the game shows its water one
  simulation step behind its clock (`TickAll` finishes step T−1, ticks the singletons, where the
  probe reads, then starts step T). Read one tick earlier, the model matches the probe's samples on
  Lake Basin 128² seed 2 to 1e-6 through both drought ramps (before, up to 0.04 while the sources
  ramped), and the whole map within 0.003 from day 1 to the drought's end, draining included.
- **What it leaves** (the knife-edge): the thin sheets the refill spreads over big flats settle at
  0.090 deep in the game, 0.01 under the threshold, and stop there; the model's sheet, with the same
  outlets (the dead-end channel blocked), settles at 0.089 too, the same equilibrium. But in the
  refill's wave the model's front at (83, 66) reaches 0.1003, crosses the threshold and re-wets
  everything beyond; the game's front stays under it. A sixth of a day into the refill the model and
  the game already differ by 0.009 m (rms, largest 0.07) where lakes fill and sheets advance, which
  float32 arithmetic (0.0001), the spill threshold's variants, the evaporation modifiers' timing,
  momentum and the flow factor do not explain (each variant fits worse). No rule difference found;
  the gap is a transient's, deciding a threshold crossing by millimetres. What a player meets is the
  game's: flats that hold a sheet within a centimetre of the threshold lose it to the first drought
  for good. That is the generator's to avoid (no flat level with a water surface), as D333 began.

### The first land shown is the map (D348)

- `gen/generate.ts`: a land is shown once it passes every check the land alone can judge (its
  courses, the Rivers count, no source in a flow, a start on its planned water, and now no ground
  above 16 unless tall, and no ruler-straight channel or dam wall on its planned water), and it is
  never replaced (`LAND_TRIES` went). After its water settles: no place for a start takes the plan's
  start, or a start the plan's water gives that is dry on the settled water too, or level dry ground
  (`settler.ts` `dryStart`); a start without water a pump reaches on foot gets a spring by it
  (`springByStart`, D330's fix); what fails is planned again on the same land, keeping off the
  starts and hollows that failed. `start.water` is read as the check reads it (before, a pump
  beside the walk counted and the check then failed on the finished map). The spring is no river of
  the water story or the signature. Water whose rivers alone do not settle stops the attempts:
  decisions-pending #150, Kyler's to decide; the fixes, #151.
- Seeds 1–10 of every theme, six maps at a time on the shared machine (before: D333's hand-back,
  3e5578c6, with the land replaced on 19 and 15 of 70 maps):

  | | before | after |
  |---|---|---|
  | lands shown then replaced | 19 / 15 of 70 | 0 / 0 |
  | 128², land / settled water / map (median, p90) | 0.5 / 4.9, 1.8 / 6.2, 2.5 / 7.1 s | 0.6 / 1.0, 1.9 / 8.2, 2.8 / 9.9 s |
  | 256², land / settled water / map | 1.8 / 13.3, 7.1 / 23.0, 9.5 / 25.2 s | 2.3 / 3.6, 7.5 / 20.7, 11.1 / 30.6 s |
  | maps passing every absolute | 70 / 70 | 64 / 58 |
  | first maps meeting all three, 128² | 38 of 70 | 28 |
  | first maps meeting all three, 256² | 35 of 70 | 28 |

  Per theme at 128² (Any, River Valley, Canyon, Highlands, Lake Basin, Delta, Islands): 7, 4, 4,
  3, 3, 3, 4 of 10; at 256²: 5, 5, 6, 5, 1, 3, 3. The maps that don't pass: water that doesn't
  settle, 5 at 128² and 10 at 256² (#150); no start after 23 attempts (Any 128² 3); starts that flood
  once levelled, 24 attempts each (Any 256² 4 and 7). A failing map's attempts are what the p90s
  hold. The land shows within D333's 256² target (3 / 6 s); settled water at 256² is at 7.5 / 20.7
  s against 8 / 20.
- **Islands and Delta at 256²** (D345): Islands 7 → 3 of 10. Seeds 1–3 miss the promise (the sea
  13–17% of the map against 25%, 1–2 islands: no land broken into islands); seeds 6, 8, 9, 10 have
  seas that don't settle (a sea standing up to a level over its spill level, its way out too narrow
  for its springs, spilling over its rim at the map's edges), which D333 hid by drawing new land.
  Delta 3 → 3 of 10: seeds 1, 2, 9 miss the promise and readable water (the main river wet on 56–72%
  of its course, 30–31% of the land near clean water, two rivers that never join), seeds 7, 8, 10
  the promise alone (1–2 mouths, 3 asked), seed 3's water doesn't settle.

### Water that won't settle, Islands and Delta (D350, 2026-09-30)

- **The rule's fix in the land (D350 (d)):** `levels.ts` `widenOutlets` kept its widening only when
  nothing drained; now the ground round what would drain stays and the rest of the cut holds (Islands
  128² seed 4's sea stood a level over its spill level behind a four-tile way out). `carveOutlets`
  gives a small basin the planned water reaches, whose spill level is a broad flat (60+ tiles), a
  stream a level under the flat, so its water leaves as a stream, not a sheet a few hundredths over
  the flat (the probe's refill knife-edge, LB 128² seed 2's flats). `courses.ts` `closeSideEdges`:
  where a river's water ties with its exit's level on another edge (Delta 256² seed 1: 200 tiles of
  its course on the beds' floor, the water left by the west edge and the lower course stood dry), a
  lip a level over it there.
- **The repair as the map arrives (D350 (b)):** `water/outletWear.ts`, a core function: the basin
  standing over its spill level (its depression and the water on the flat round it, one surface),
  the route its water leaves by and on down, twice the width, and the banks along it taken down to
  the route's own bed by a width that wanders (0.6–1.4 of the width, a ragged edge), never within two
  tiles of the basin under its level, never on sources, hollows or the player's ground; 7, 11, 15,
  then 23 tiles wide, the first that settles. It is part of the land (the field), so the link
  rebuilds it. Captures: `investigation/m9b/worn-way-out-delta-4-128.png` (59 tiles) and
  `...-lakeBasin-8-128.png` (13); each shows the land as shown, as the map arrived, and the cut in
  orange (`investigation/m9b/worn.ts`). (Superseded by D358 and D360 (3), 2026-10-01: with the
  6-day settle neither map needs a cut, and the cut is now one shape; the captures are
  `worn-way-out-any-5-128.png` and `worn-way-out-lakeBasin-4-256.png`.)
- **Islands:** the sea's rim is never breached at the edges (its inner line wandered to the edge and
  the sea drained out, 256² seeds 1–3); the edge layout's sea larger and further in; islands spread
  over the sea's ellipse; on larger maps fewer, larger islands (count × area^0.3, size × area^0.35:
  the promise's island size grows with the map); and an island joined to the land by low ground is
  parted by a strait (`land/islands.ts`). Seeds 1–30 at 128²: the promise 15 → 20, all three 14 →
  18; 256², seeds 1–10: all three 3 → 7.
- **Delta:** the mouths apart in proportion to the map's side (at 256² they ran together at the
  edge); with the side lips, seeds 1–20 at 128² all three 10 of 20, 256² 5 of 10 (3 before).
- **Seeds 1–10 of every theme** (six at a time; the machine was shared, so the times are also given
  scaled by the process's CPU share):

  | | 128² | 256² |
  |---|---|---|
  | maps failing an absolute | 4 of 70 (6 before) | 5 of 70 (12 before) |
  | lands shown then replaced | 0 | 0 |
  | ways out worn wider (b) | 2 | 5 |
  | other fixes on the shown land | 11 maps | 4 maps |
  | first maps meeting all three | 31 of 70 (28) | 37 of 70 (28) |
  | land, median / p90 (CPU-scaled) | 1.3 / 2.6 s | 3.3 / 6.2 s |
  | settled water | 3.7 / 10.2 s | 11.2 / 27.6 s |
  | the map | 5.5 / 13.2 s | 16.0 / 51.2 s |

  All three per theme (Any, River Valley, Canyon, Highlands, Lake Basin, Delta, Islands): 128² 7, 4,
  4, 3, 5, 3, 5; 256² 5, 6, 6, 5, 3, 5, 7. Still failing: water that doesn't settle even worn wider
  (128² Any 3, River Valley 7, Delta 9, Islands 9; 256² Any 9, River Valley 8, Lake Basin 7, Delta 7):
  half settle in 4.3–4.8 days, the rest are lakes whose water falls for days (fed less than they
  lose: no way out to widen); and Any 256² seed 7, whose starts flood once levelled (24 attempts).

### The land-stage screen, fixes for the water that falls, time (2026-09-30, night)

- **The screen** (`generate.ts`, `landScreen`): before a land is shown, its outcomes are read on the
  water its rivers were planned with (the promise, `outcomes.ts`; the water story, `story.ts`), and
  a land that misses either is drawn again, up to 6 lands at 128², 4 to 192², 3 above (the land
  stage is part of the time to land). The cheap land checks and the screen run before the start's
  guess, and a land drawn again builds nothing for its record. The planned reading holds on the shown
  lands' promise almost always (Lake Basin 256² over-predicted on 3 of 8); it misses water stories
  where the settled water splits the planned system (a river dry for half its course, rivers that
  never join).
- **Water that falls or rises:** a lake nothing feeds, falling as it evaporates, gets a small spring
  at its deepest tile (`lakeSpring`, about three times what it loses); a lake fed less than it loses
  gets its feeding sources stronger (1.6, 2.5×, `feedFix`); water still rising over a flat at its spill
  level (no depression) has its way out worn wider too; a source's tiles are no way out (the game
  walls them). All are recorded in the features or the land and kept on later attempts on the land.
- **Faster fixes:** a start spring is judged on the pre-fill's water before its settle (one 256² map
  34 → 23 s: 13 s went to three spring tries that flooded the start or gave it no water).
- **Seeds 1–10 of every theme at 128²:** 1 of 70 fails an absolute (River Valley 2: a canal 35.8
  tiles on its settled water, over the 34.3 line, planned water well under it; a shown land can't be
  planned again for it, D348, so the attempts stop); all three outcomes on 50 of 70 (Any 8, River
  Valley 6, Canyon 9, Highlands 6, Lake Basin 6, Delta 7, Islands 8); land 1.2 / 3.1 s, settled water
  3.3 / 10.0 s, the map 4.4 / 10.9 s. Seeds 11–20: River Valley 5, Highlands 7, Lake Basin 6, Delta
  9 of 10. At 256² (the screen, before the falling-water fixes): 2 of 70 fail (Any 9, Lake Basin 5),
  all three on 52 of 70 (Any 7, River Valley 8, Canyon 9, Highlands 6, Lake Basin 4, Delta 8, Islands
  10), but the land at 5.2 / 15.2 s and settled water 17.6 / 42.4 s CPU-scaled, far over 3 / 6 and 8 /
  20.

### Time, water that settles, straight channels, D358 and D360 (3) (2026-10-01)

- **Time, exactly** (no map changes): a river's path field prunes whole tile blocks against its
  segments' chunks (`features/geometry.ts`; `tests/unit/pathField.test.ts` proves it bit for bit
  against every segment for every tile) and a land's builds share the fields (`sharedFields`); the
  settle cache keeps the last four settles (the attempts on one land reuse what they share); the
  drainage flood takes its directions by index (about twice as fast, the same tiles in the same
  order). On five 256² maps the path fields went from 8.7 s to under 4 s.
- **The 20-seed measures, before D358** (seeds 1–20, every theme, both sizes, 6 jobs): at 128² 4 of
  140 failed an absolute, all three outcomes on 102 (73%); at 256² 13 of 140 failed (10 water that
  wouldn't settle, 3 straight channels), all three on 83 (59%), settled water 9.2 / 25.4 s. Every
  256² water failure was a big lake or sea the pre-fill starts at its spill level, rising by its
  outlet's head for 4.2–9 days (D68, D83): a narrow way out, a broad flat at the spill level carrying
  the rivers' water (Islands 12's sea is fed across a 9,700-tile shelf through a 3–4-tile corridor),
  or a plug holding a lake over a 2-tile line (Lake Basin 16). A pre-fill that adds the outlet's head
  was tried crudely and didn't help (over-filled basins spill into side hollows).
- **Fixes on the shown land:** a plug that keeps the water from settling is opened; the wear takes
  the basin over its level, then the water still rising (found by running the settle on), at 9 then
  17 tiles, a cut of at most 2% of the map (stopping at once when the rivers' water alone won't
  settle was tried and undone: River Valley 128² seed 7 settles on its second plan's hollows). A
  start the settled water covers or that no
  spring serves gives way to another on the same settle (three in all; a levelled pad judged first on
  water warm-started from the settle), and later attempts on a shown land keep the hollows whose
  water settled, so their settle is reused.
- **Straight channels found only on the settled water** (Any 12 128², Any 13, River Valley 17, Canyon
  4 and Any 17 at 256²): the outlets cut across a basin's flat ran along the grid (`carveOutlets`: the
  cheapest way over a flat is a straight line); they are wound like a gully now (`land/wind.ts`, the
  ditches' winding moved there), a badwater ditch that stays straight is refused, and a cut shelf's
  straight water edge gets notches. All five pass.
- **D358** (Kyler, 2026-10-01): the canonical settle runs up to 6 game days (`SETTLE_DAYS`, and the
  Python checker). The golden vectors change only for the two fixtures whose water never settles;
  `tests/unit/settleDays.test.ts` proves water that settles within 4 days ends the same; of 28
  generated maps 26 keep their bytes, the two that change had water still moving at 4 days. Of the
  25 256² maps that failed water.settles or needed a water fix, 23 passed with 6 days and 16 needed
  no fix at all.
- **D360 (3)**: the worn way out is one shape along its water's path: a channel widened on one bank
  (the side that takes the less ground away), its width changing smoothly, the largest piece of the
  worn ground kept (`cutShape`: one piece, no stray tiles, nothing
  off the path's side; it refuses Lake Basin 8's old cut). The route through a basin's necks is gone
  with it. Kyler (D360): Any 128² seed 5's cut looks natural; Lake Basin 256² seed 4's had arms where
  its path turned: no part of a cut is narrower than three tiles now (`openSquare`), `cutShape`
  refuses thin parts (a test on that cut), and the cap is 200 tiles. The captures:
  `investigation/m9b/worn-way-out-any-5-128.png` (64 tiles), `worn-way-out-lakeBasin-4-256.png` (51).

### The 20-seed measures after D358 and D360 (889f7ddf, 2026-10-01, a quiet machine)

- **Absolutes failing:** 1 of 140 at 128² (Any 11: no start, its places poor in farmland, level land
  and wood) and 1 of 140 at 256² (Islands 12: its sea's water doesn't settle with a one-bank cut under
  the 200-tile cap).
- **All three outcomes:** 106 of 140 at 128² (Any 14, River Valley 11, Canyon 17, Highlands 16, Lake
  Basin 12, Delta 17, Islands 19 of 20) and 91 of 140 at 256² (Any 12, River Valley 13, Canyon 14,
  Highlands 11, Lake Basin 11, Delta 13, Islands 17). Most misses are water stories the planned water
  read as whole; Highlands 256² keeps its promise on 38 of 92 lands drawn.
- **Worn ways out (b):** 2 maps at 128² (Any 5: 64 tiles, Delta 4: 57) and 6 at 256² (20–86 tiles),
  each one shape; 7 maps at 128² and 21 at 256² settle in 4–6 days with no cut.
- **Times** (median / p90): 128² land 0.8 / 1.6 s, settled water 2.0 / 5.5 s, the map 2.6 / 6.3 s;
  256² land 2.1 / 5.2 s, settled water 8.6 / 20.5 s, the map 10.6 / 22.7 s.
- **Islands 256² seed 12, fixed at the source:** its sea stood over an 18,700-tile shelf at its own
  spill level (the water crosses it as a sheet and fills for days; seeds 15 and 19, which needed a cut,
  over 13,800 and 18,700; every other Islands land 2,000–8,300, 128² lands under 6,000). A sea layout
  over a shelf of more than 10,000 tiles is drawn again before it is shown; Islands 256² seeds 1–20
  then all pass and meet all three outcomes, one small cut left (76 tiles). Lowering a sea's shelves
  instead (as a lake's are) was tried: 5 of 20 256² seas then failed to settle.
- **Any 128² seed 11, fixed at the source:** its atolls' sea stood 80% on a flat at its own spill
  level (5,574 tiles, a third of the map), which its water covers thinly or not at all: the land
  round it stayed dry and no start found farmland, wood or level land. A sea standing at least 75% on
  its shelf over a quarter of the map is drawn again too. Any and Islands, seeds 1–20: none fails at
  either size; all three outcomes 17 and 19 of 20 at 128², 15 and 20 at 256² (Any was 14 and 12).

### The probe batch m9b-20261001 (889f7ddf, 22 maps)

Every map passed every check (138 passed, 22 recorded screenshots), with a clean restore; results in
`C:\dgm-probe\results\m9b-20261001\` (local). The 18 maps of the M9b group include River Valley 2's and Lake Basin 2's
calendar timelines, which failed on the refill gap in the last batch, and the two Sources: None
maps. D358's four slow-settling maps (Lake Basin 256² seeds 16 and 5, Any 256² seed 12, Islands
128² seed 3: 4,096–4,608 ticks) keep their stored water: after a day 100%, 100%, 100% and 98.3% of
their wet tiles within 0.1 deep of the file, the volume within 0.2–0.9%.

### The faster water settle, adopted (D359, Codex's `investigation/water-speed`, 2026-10-01)

`sim/water.ts` keeps its bookkeeping up to date as tiles turn wet or dry instead of rebuilding it
each substep or tick (the active list by reference counts, wet-neighbour counts, the evaporation
modifiers of the 5×5 round a change, neighbour indices, clearing only dried outflows, a dry tile that
receives nothing set directly, the active list sorted every 64 ticks). Codex's mechanisms, rewritten
for reading; the file says why each is exact. A new test checks the kept bookkeeping against a rebuild
every tick (`water-speedups`; it fails if the 5×5 shrinks to 3×3).

**Identity** (0ee6e276, Codex's A/B harness against the engine before, both in one process, every
step compared): 303 of 303 cases identical: seeds 1–20 of all seven themes at 128² and 256² (map
sha and settled water, every generation attempt, the canonical settle in slices, a live edit, a
Normal drought and badtide day by day and the return), the 19 official maps, two saves and two
projects; 95,167 checkpoints. Under D358's 6 days: 26 maps settle after day 4, 9 never do, all
identical. Every golden fixture under both rules, the edge grids and 100 random scenes too. The
Python checker: 0 disagreements (47 generated, 19 official maps; `npm run oracle`'s 6 refusals are
the generator's). The quick suite's 43 failures on this base are the same 43 with the engine before.

### Mine-site pads (D363, 2026-10-01)

At 96², 17 of 140 maps failed an absolute, each with no mine site the colony reached. Why, map by
map: rugged land with no level 7×7 square in the start's walk; the badwater hollows, planned after the
land was shown, took the level ground; the settled water or a hollow cut a thin neck between the start
and its squares; a start's own pad, dug down to its water, left it on a ledge; the objects kept off
the discs round the starts that failed (16 tiles each, a tenth of a 96² map), so three failed starts
left nothing.

- **Pads as the land is shaped** (`land/minePads.ts` `minePads`): the planned start's walk, its land
  joined two tiles or more from the planned water, must hold two level squares for a site (one at
  48²) 24 tiles or more out, clear of the water as the objects keep it. Where it holds too few, the
  ground nearest to level becomes a pad: its tiles a level over it taken down to it (never more,
  never raised), about 49 tiles and at most 61 with its edge, round, its edge wandering a tile or two
  out and left as it is where the ground beyond stands two levels over it (no notch under a cliff),
  five tiles or more from the planned water. Where the planned start has no room even so, another
  planned start with room becomes the plan's start; a land with none is drawn again before it is
  shown. Tests: `tests/unit/minePads.test.ts`.
- **Kept for them:** the hollows keep off the squares and the colony's way to each (off the squares
  alone where that leaves them no room: Islands 128² seed 4); on the settled water the start goes
  where its walk has that room (`roomMap`, reading the ground as the objects' placement reads it), and
  a start chosen there whose own pad leaves none gives way to the next; the objects may stand where a
  start failed.
- **The attempts:** lands drawn again before one is shown don't use up the attempts, up to 16
  (`FREE_DRAWS`); the disc round a failed start shrinks with the map (`bandScale`: 12 at 96²).
- **What the 840-map measures found next, each fixed at its cause** (the old code on seeds 21–40
  failed 21 maps at 96², 3 at 128², 5 at 256²):
  - the planned water the start, its second place and the mine sites' room are judged on
    (`plannedWater` with `held`) stands a planned lake
    no higher than the rim its land spills over (0.3 over it) and only where the land holds a pool of
    9 tiles or more (Canyon 96² seed 16: a start by a lake planned at 6.6 that settled at 3.7–4.1;
    Any 128² seed 26: a start relying on a one-tile pit of a lake its land didn't hold), and gives a
    river the depth of the width it spreads to over ground no higher than its bed (River Valley 96²
    seed 33: 0.42 planned in the channel, 0.12 settled over the floodplain, too shallow to pump);
    tests: `tests/unit/plannedWater.test.ts`;
  - a land with an inflow's head two levels or more under water held downstream is drawn again
    before it is shown (`land/courses.ts` `drownedHeads`; Canyon 256² seed 14: a head at 4 under a
    lake held at 7 backed up to the edge, put its sources in a flow and never settled); tests:
    `tests/unit/drownedHeads.test.ts`;
  - a land with a wall along an edge (D151) is drawn again before it is shown (River Valley 96² seed
    2 failed every attempt on its shown land).
- **D348 as D370 has it** (d4d2177c, 49eba513): every shaping step finishes before the first land is
  shown, but D350's worn way out. The badwater hollows are dug as the land is shaped, read on the
  pre-fill (moved off any whose source another's water reaches) and never dug again; a plan's start,
  its second place and two more places apart from them have their pads levelled then; no start is
  levelled after the land is shown; rivers whose sources the pre-fill shows reached leave before it
  is shown, and the main river never leaves after. Tests: `tests/contract/firstLand.test.ts` (96²,
  128², every theme; failed first, Any 96² seed 1: 119 tiles changed after the land was shown) and
  `firstLand256.test.ts` (the heavy suite).
- **Codex's audits' shared findings (D370):** a river's course carved at its bed through a planned
  lake (8750c300; River Valley's water gaps; `tests/contract/lakeCourse.test.ts`); the canyon reading
  from the first dry tile out (`tests/unit/canyonSignature.test.ts`); the water story joined over a
  plug (`tests/unit/storyPlug.test.ts`); the mine sites the colony must reach placed as a pair
  (0deba098; `tests/contract/minePair.test.ts`); islands in a lake hold objects and Islands' water
  cap is 0.70 (D369; `tests/contract/lakeIsland.test.ts`, `tests/unit/waterCap.test.ts`).
- **Adopted, one at a time** (seeds 1–20 of the theme; 24 maps of every other theme byte-identical
  each time): Islands' sea-first shaping (3aedffce; all three 9 → 17, 20 → 20, 20 → 20 at 96², 128²,
  256²), Delta's alluvial plain and braids (1b77d40f; 11 → 19, 16 → 18, 16 → 17), River Valley's own
  shaping (cd5d5bf4; 18 → 17, 16 → 18, 15 → 17).
- **D373 (1)** (a69c9f11): a channel below each confluence is cut as wide as all the water it
  carries (Canyon 256² seed 22's six rivers through channels three tiles wide ran over their banks
  onto a flat). 256²: no failing absolute in 280 maps since.
- **D372's sheet rule and D373 (2)'s fill time: readings only.** Neither reads what floods on the
  land and the planned water alone (Canyon 22's water rose over the plan's level where its outlets
  couldn't pass the inflow; Canyon 14's was a deep lake filling slowly), and on 840 maps both would
  only reject lands that settle; `info.sheet` and `info.rise` record them. **Starting a slow lake
  full, the design kept for if one appears:** find the lake's settled level by running the game's own
  settle on until that lake stops rising; keep that water as the lake's starting water
  (`sim/water.ts` RetainedWater, as a carve's oxbow lake keeps its own), recorded in the lake feature
  so a share link rebuilds it; every settle, and the game, then start from it, and the stored level
  is the one the game's rules settle to.
- **D373 (3)** (62858d54): the plan's start, its second place and two more places apart from them
  have their pads levelled, and their mine sites' room made, before the land is shown; a start on the
  settled water takes a prepared place before one that would need levelling.
- **The last failing maps, each traced to its cause** (840 maps, seeds 1–40):
  - *The debris before a second district* (Delta 128² seed 37) stood across the colony's way to both
    mine sites, placed before it. "Reached" is now one function for the check and the generator
    (`colonyReach`, `minesReached`, D342; `tests/unit/colonyReach.test.ts`): the second site is placed
    on the walk round the first, and neither the debris nor an object set after the sites may cut the
    colony off from a site it reached. Fixed.
  - *A lake along a straight trough* (Canyon 128² seed 16): erosion cut a canyon 35 tiles long at
    exactly 45°, and a lake filled it. On the plan its bank read 22 tiles straight, broken by the
    channels that join it; those settled too shallow to count and the bank read 47, over the limit of
    44, on a land already shown. A land's planned lakes are now read alone as well, at the limit
    itself (47 here). Fixed. The cost, measured: on five other maps of the 840 a land that settled
    within the limit before is drawn again (Any 128² seed 38; River Valley 11, Canyon 27 and 31, Lake
    Basin 39 at 256²; nine lands in all); all five still build, none loses an outcome, River Valley
    11 gains all three.
    Capping a joined channel's width at twice its swing, tried first, changed about 240 lands and
    not this one: taken out again.
  - *A wall on the settled water only* (Any 96² seed 18, Lake Basin 128² seed 5). Where a river
    arrives lower than a planned lake's bed, its channel (8750c300) is cut through the lake's tiles,
    and the floor the river clears round the lake skips them, so the lake's old bed stands between
    the channel and the floor as a band of rock with the river through it. The plan counts the lake
    full, so the dam-wall check before the land is shown read those tiles as water and passed. The
    check now also reads the pre-fill alone, with its water under 0.2 deep left out (13d1f1a2;
    `tests/contract/drainedLakeWall.test.ts`): over 840 maps it flags those two and no other.
    Fixed. Tried and dropped on the way: a reading of dam walls from the land alone (it flagged 2,
    5 and 26 lands that settle fine at 96², 128² and 256², and missed Any 18); clearing the floor
    through the lake's tiles (both maps pass, but that old bed also keeps a river off its
    floodplain: River Valley 256² seed 37 then never settled, River Valley 96² seed 1 flooded to
    36%, and Lake Basin's first maps meeting all three fell 12 → 8 of 20 at 256²;
    `investigation/m9b/patches/lake-floor.patch`); the plan's own estimate made true (a tributary
    across the old bed reads as wet on any plan and settles dry).
  - *Still failing, with their causes:* Any 96² seed 31 and Islands 96² seed 4 (the settled water
    moves the start off the plan's, and no other start's land holds two level squares 24 tiles out:
    Islands 4's island is about 20 tiles across). Highlands 96² seed 14 passes at cc161b3a, by the
    order of its attempts only: three of its starts still lose their water once it settles.
  - *A reading for later:* `info.preWet`, the share of the map under the planned water or the
    pre-fill before the land is shown (nothing reads the water cap before then; on one land tried it
    read 39% where the settled water covered 36%).
- **Measured at 13d1f1a2** (840 maps, seeds 1–40; in brackets the measure before this round):
  failing an absolute 2 (4) at 96² (Any 31, Islands 4), 0 (3) at 128², 0 (0) at 256²; first maps
  meeting all three outcomes 213 (211), 228 (225), 229 (228) of 280. Per theme, seeds 1–20, at 96²,
  128², 256²: Any 19, 18, 17; River Valley 19, 18, 16; Canyon 11, 15, 15; Highlands 9, 15, 17; Lake
  Basin 12, 13, 12; Delta 19, 18, 17; Islands 19, 20, 20 of 20. Median time to the map 2.2 s, 2.8 s
  and 9.0 s (the faster settle, D359).

## Handoff (2026-09-27, evening)

Where it stopped: the last commits on `feature/m9b` are `2afb62f9` (decisions-pending #134 follows
D290) on `d5dd375f` (two map fixes) on `284818ad` (sources in groups). Since the grouped sources:

- **D314's source groups** (`284818ad`): `src/core/water/sourceGroups.ts`, its README and
  `tests/unit/sourceGroups.test.ts` taken whole from `a6346fe4`; inland springs and a lake's spring
  are groups (`placeSourceGroup` in `features/build.ts`); an edge mouth is the rule's row
  (`mouthRow`/`mouthRowAt` in `features/raster/terrain.ts`, cut by `land/hydro.ts`, sealed by the
  build; the channel narrowed to it). Pending default #134.
- **D290 and the badwater toggle** (`2afb62f9`, docs only): on a mouth of 2 the editor's badwater
  toggle follows D290 (the 3×3 moves in along the channel and cuts its own pool, never refuses);
  that editor side lands with `feature/forces` (dd01844). Nothing to build on M9b.
- **Two map fixes** from the contact sheet (`d5dd375f`): a badwater ditch no longer runs
  ruler-straight where its wave met ground it keeps off (`land/hazards.ts` `windOnce`: the wave
  swings less there, down to the route); the sea's rim of land along the edges wanders
  (`land/field.ts`, `keepRim`), so no sea draws a square.
- `docs/sheets/m9b.png` (committed earlier) was made before the grouped sources and these fixes:
  remake it at the release candidate.

**The quick suite on `d5dd375f`** (`npx vitest run --project quick --maxWorkers=4`, about 25 min):
765 passed, 10 failed, 13 skipped. The ten, and what each needs (D148: re-seed or re-pin, never
weaken):

| Test | Now | Needs |
|---|---|---|
| `tests/contract/look-mine-ruins.test.ts`, the 4242 download | `LIVE_SHA` 8d2941ad… | re-pin to the new sha (4f739ec0…; print the full one with the snippet below) and add 8d2941ad… to the comment's history |
| `tests/contract/brush.test.ts`, "smooth, make walkable…" | River Valley 96² seed 4 | another seed where the stroke by the start finds a cliff |
| `tests/contract/carve.test.ts`, the oxbow carve | Canyon 96² seed 22, aim (48, 10) → (48, 86) | a Canyon seed and aim whose carve leaves a lake of 70+ tiles |
| `tests/contract/objects.test.ts`, "ruins on a rise" | highlands 7, islands 6, 8, 7 (2 of 4 now) | four 128² maps holding an `obstaclePayoff` set piece |
| `tests/contract/setpieces.test.ts`, "an on-river fall asked to drop 16…" | `session(96, 7)` | a 96² seed where some place along a river takes the fall |
| `tests/contract/setpieces.test.ts`, gorge, terraced cliffs, badwater basin | `session(128, 7)` (the describe's one map) | a 128² seed where all four builders' range tests pass |
| `tests/contract/shelf.test.ts`, the painted grove | River Valley 96² seed 18 | a seed with 9×9 open level ground 16+ tiles from the start |
| `tests/contract/resources.test.ts`, "generated maps carry the official amounts…" | 0.5225, the line < 0.52 | **look first**: a share just over its line on the grouped-source maps; find which measure and whether a map changed or the line was tight, before re-seeding |

**Next step, in order:**

1. Re-seed the six seed-bound tests the way the earlier ones were (`docs/progress/m9b.md`, "Tests
   updated…"): make the test's seed an environment value for a moment, try seeds, keep the first
   that passes, hard-code it with a one-line reason, e.g.

   ```
   sed -i 's/session(128, 7)/session(128, Number(process.env.GSEED ?? 7))/' tests/contract/setpieces.test.ts
   for g in 8 9 10 11 12; do GSEED=$g npx vitest run tests/contract/setpieces.test.ts -t "the other builders" | grep -E "Tests "; done
   ```

   For the set-piece maps, a quick finder: generate seeds and list the maps whose features hold
   `obstaclePayoff` / `secondDistrict` / `weir` (`r.features.some((g) => g.kind === "setPiece" &&
   g.params.kind === "obstaclePayoff")`). For the oxbow: a Canyon 96² sweep over seeds 1–30 and six
   aims (corner to corner both ways, edge to edge both ways), keeping the first whose
   `carveParams(...).lake.tiles.length > 70` (the test's own `carveOp`).
2. Re-pin the 4242 sha:

   ```
   npx tsx -e 'import { createHash } from "node:crypto"; import { generate } from "./src/core/gen/generate"; import { makeSpec } from "./src/core/spec/mapspec"; const r = generate(makeSpec({ seed: 4242, size: { x: 128, y: 128 }, theme: "riverValley", designedFor: "normal" })); console.log(createHash("sha256").update(r.bytes).digest("hex"));'
   ```
3. Look at the resources test's 0.5225 (above), then run the quick suite again; log every changed
   test under "Tests updated…" (D148).
4. Then, under D308: small samples on 256² generation time (Canyon 256² seed 1 still takes 12
   attempts, most refused after the settle: a source in another's flow, the water not settling, the
   course check); the names hand-check (30 maps, 10 at Variety 100); merge `origin/dev` when M9a
   lands there. At the release candidate: the contact sheet again (`npm run sheet -- --compare
   origin/feature/m9a --png docs/sheets/m9b.png --no-open`), the per-theme batches (`tools/batches.ts`,
   96/128 at 100 seeds, 192/256 at 50, 4 jobs) and the chaos batch (`--themes any --sizes 128,256
   --set "vy=100&vt=100"`), the 200-seeds measures, the pooled probe, then the review set
   (`investigation/m9b-review/make-all.ts`).

Also in flight: the rules set Real places 2 takes is `1c9d1340` (its checkout line is in the
milestone session's messages and in the commit's message: water and soil default to the port's
there); the paused per-theme batches of the port-era generator (investigation/m9b/local/batches/)
are stale: don't resume them.

## What was built

### One readable water system (D273 (1), D294 (1))

M9a's maps held 4–9 separate water systems each: every river head, spring and spring lake found its
own way to its own edge. Now (`land/hydro.ts`):

- **The main river first, tributaries after.** The first head traced is the main river; every later
  head must join the water already traced, as a tributary at least 18% of the map's side long. Only
  a Rivers count the player set may enter as a river of its own when none can join. At most 4–6
  heads (4 at 96², 5 at 128², 6 at 192², 7 at 256²), a spring lake's kept room among them.
- **Rivers that can be followed** (`land/courses.ts`). Before the water settles, a priority flood
  from every draining edge tile (all but an inflow's sealed mouth) and a second from the stretch of
  edge the river's system leaves by (35% of the side either way, and a delta's mouths): where some
  course tile's water has a strictly lower way out elsewhere, the plan is refused and made again
  (an attempt refused before its water settled now keeps only its land for the record, no settle).
- The causes it found, each fixed at the source:
  - **a lake standing above where its river begins**: a lake found on a course now stands below the
    head's level (the mouth's banks, or the spring) as well as within the water budget; a
    budget-cut hollow is one lake, not several copies;
  - **a head below the spill of its own way down** (a low point of the upstream edge behind a ridge,
    or a hollow on the way filling above the head): refused when it is traced;
  - **an inflow's banks lowered to its channel**: the carve and the edge relaxing now leave the
    outer two rows of an inflow's edge beyond its mouth's own width (the game drains every edge tile
    but a mouth's sources), and an inflow heads inland from its mouth, never along its edge;
  - **a weir whose pool drained by an edge 40+ tiles upstream**: its pool is followed all the way;
  - **an inflow's water running back out by its own edge** (a low plain along the edge beside the
    mouth; a tie with the exit counted too, since the near edge takes it all): the edge row there
    gets a lip a level over the water, at most two levels high and a quarter of the side long, else
    the plan is made again; the mouth's own tiles never;
  - **a lake standing higher than an inflow's mouth could hold** (its water would stand over the
    mouth's edge beside it): a lake on a river stands no higher than the lowest spill of every
    inflow mouth whose water reaches it;
  - **an inflow's mouth** keeps a level block three tiles wide and three deep at its lowest bed
    (the edge's banks beside it are kept now; a narrower mouth held no BadwaterSource when the
    player turned the river to badwater in the editor: 4 of 16 River Valley mains could, now all);
  - **a spring lake's water** joins the rivers already traced, as a spring's does (a spring lake
    with a way out of its own was a second system, sometimes larger than the river's);
  - **a hollow on the course above the river's reach** (a pit on a shoulder the course crosses, its
    water standing over the channel's banks upstream, where they drain away lower): no lake of that
    river's, so its channel runs on through it (it was left uncarved, then dropped as unreached,
    and the course stood high and dry across it).
- **The water story** (`analysis/story.ts`, information and the candidate choice): the main
  system's share of the water, other systems, heads, rivers that never join, how much of each
  river's course holds water, and how much of the dry land lies within 14% of the side of clean
  water (D294's "water in one corner").

### Themes keep their promise (D273 (2))

`analysis/signature.ts` measures each promise; `gen/outcomes.ts` `PROMISES` sets the lines where
the theme's maps part from the others (on seeds 1–10 of every theme at 128²):

| Theme | Promise | Measure and line |
|---|---|---|
| River Valley | a main river through a broad valley | the main river's valley floor (within a level of its water), median across its course, ≥ 20% of the side at 128², growing as the square root of the side |
| Canyon | a river cut deep between cliffs for a real stretch | a river whose ground 2–6 tiles out rises 3+ levels over its water on both sides, for max(16, 16% of the side) tiles and 20% of its course at 128² (the length growing, the share falling, as the square root of the side) |
| Highlands | high, rugged ground with plateaus and valleys among it | 60%+ of the dry land 4+ levels over the rivers, 3+ plateaus (level ground of 120+ tiles at 128² whose rim mostly drops 2+ levels), cliffs on 10%+ at 128² (lines: their share falls as the square root of the side, 7% at 256²) |
| Lake Basin | big lakes that dominate the water | 55%+ of the water in the natural lakes the generator found (its read-back lake features; level bodies counted wide rivers too), the largest 4%+ of the map |
| Delta | a river splitting into several channels as it reaches low ground | the main system leaves by 3+ separate mouths |
| Islands | land broken by water into islands | 3+ islands of 30+ tiles (at 128²) in a sea of 25%+ of the map, 5%+ of the land apart from the largest mass |

**Larger maps** (the paused 256² batches: River Valley missed its promise 40 times in 14 maps,
and "only a fifth of the land near clean water" was the commonest water miss on every theme): the
valley floor, the springs and the heads grow with the map (the floor and the springs as the square
root of the side and the area, the heads as the area to the ¾), and River Valley's line is a floor
25.6 tiles wide at 128², growing as the square root of the side (36 at 256²).

The priors were steered toward them (they blurred, D294 (2)): River Valley's big river clears a
floor of 7–13 tiles; Canyon's floor 0–2.5 and its cut 3–6 levels; Highlands leans up (lean
0.55–0.9), with more and broader plateaus, benches 2–3, rivers set 1.5–3.5 into their valleys;
Delta always fans into two or three more mouths; Canyon has 2–5 springs, so side canyons carry
water across its plateaus (its water sat in one corner, D294 (1, 4)).

**Islands had no sea** (D294 (2)): the Lakes setting's None applied at Islands' own preset (None),
cutting every sea's lake budget to nothing. A setting now leans the genome only where it moves from
the theme's preset. The sea lies in one of six layouts (`land/genome.ts` `addSea`, its own random
stream): off-centre, off one edge behind a strip of coast, an archipelago across most of the map,
an island chain along an arc, atolls (rings of islets, lobed, with passes), or two seas with a
ridge between. A sea is fed by springs on the heights round it (an inflow enters low on the bowl's
rim, and no lake stands above where its water comes in), and keeps a rim of land along the map's
edges: a sea that ran to an edge spilled out there and stood low, its islands on the dry floor
joined to the land (Islands met its promise on 3 of 10 maps; the archipelago's sea is broad again,
its islands scattered where the water is deep).

### A character on every map (D273 (3), D274)

- **The set** (`land/intentions.ts`): Kyler's four and the seven, and the ten he picked: the oxbow
  lake, lakes stepping down the valley, the river split round a big island, two falls side by side,
  a long cliff splitting the map, hanging side valleys, two ways to grow, badwater through the
  richest land, a relic on a pinnacle, a plug holding back a lake. Each has its steering (a nudge,
  never a build) and its check on the finished map. Every map draws one (60%) or two (40%).
- **The recipes fold in** (D275 (1)): the great scarp is the long cliff's steering, the island in a
  river the split island's, the chain of lakes the stepped lakes', the mesa field one of the
  landmark's, the hanging lake and the caldera already Kyler's high lake and crater; the badwater
  volcano and the volcano island are dropped (the Islands layouts stand for the second).
- **Lakes read per level body**: the checks read every level lake within the water (a river joins
  the lakes along it into one body, and each counted as one before).
- Emergence, forced on Any seeds 1–6 at 128² (`tools/intention-rates.ts`), first round: the long
  cliff 6/6, badwater through rich land 3/6, the split island, two ways and the relic 2/6, twin
  falls, the oxbow and stepped lakes 1/6, hanging valleys and the plug 0/6. Since: the oxbow tries
  any river where its bed has room below it; two ways and badwater through rich land steer the
  start (its preference reads the farmland one way and higher ground the other, and the low land
  beside badwater within 60 tiles) and are re-steered once like the other start intentions (two
  ways 3/3 on seeds 1–3).
- **A map's own intention** (D138: failure allowed, many realizations): when none of the
  intentions a map was steered toward emerged, the set is checked on the finished map in an order
  drawn from its seed, and the first that holds is its standout ("found", not steered). Every map
  of seeds 1–10 of every theme then had a standout (58 of 70 had one before it).

### Candidates by the outcomes (D278 (1a))

`generate` makes candidates until one meets the three outcomes (readable water, the theme's promise,
a standout intention); a candidate that misses one grows new land; after 4 the best stands (the most
outcomes met, then stored water near the start where the player asked for more reserve). It replaces
K = 3 and the score (dropped with M9c, D278 (3)). Each candidate is announced (`onCandidate`); the
page shows the first one found, its water settled, and "Found a map. Looking for a better one (2 of
4)" while it looks on.

Where the outcomes stand (seeds 1–10 of every theme at 128², `tools/look.ts`; three rounds, the
last after the course, sea, Canyon, badwater and found-intention changes). Times are medians on this
machine while other sessions' tests and conversions ran (four maps at a time), so they are high:

| Theme | Promise | Water reads | Standout | All three | Attempts | Time | First candidate |
|---|---|---|---|---|---|---|---|
| Any | — | 8 | 10 | 8 | 3 | 12.6 s | 8.8 s |
| River Valley | 10 | 6 | 10 | 6 | 5 | 23.2 s | 4.7 s |
| Canyon | 10 | 10 | 10 | 10 | 5 | 17.7 s | 5.6 s |
| Highlands | 10 | 10 | 10 | 10 | 3 | 11.2 s | 4.7 s |
| Lake Basin | 7 | 10 | 10 | 7 | 5 | 11.9 s | 5.3 s |
| Delta | 9 | 10 | 10 | 9 | 2 | 10.3 s | 7.2 s |
| Islands | 8 | 10 | 10 | 8 | 3 | 32.9 s | 15.5 s |

(The first round: 30 of 70 met all three; Canyon's water read on 4, Islands kept its promise on 3.)
Most of the time is the water's settle, once or twice an attempt (about 0.6 s at 128², a broad sea
2–2.5 s: Islands' first candidate is slow for that). What still misses: River Valley's water on 4 of
10 (a separate spring lake larger than the river's own water, a tributary dry most of its course,
dry uplands), Lake Basin's lakes on 3.

### Nothing stamped (D273 (5), D294 (5))

- Crater rims (the caldera part) and round lakes are lobed by two waves round them (on a
  pseudo-angle, the deterministic sine) and stretched along a drawn axis; cone craters noisier.
- The badwater pit is 1.5–2.1 times as long as wide, along the fall of the ground, so its stain
  runs down toward its ditch instead of a round disc; a ditch joins only a channel whose water
  leaves the map without passing a lake (it poisoned whole seas and lakes), and only in the last
  12% of the side before it leaves (joined higher up, it turned the main river's whole lower course
  purple), else it runs to the edge; on its way it never crosses or runs beside other water.

### The 8 orientations (D275 (2))

`land/orient.ts`: each map's land is turned or mirrored into one of its 8 orientations right after
it is made, from a stream of its own, and the water's way with it; the rivers, the start and the
objects are then found on the turned land. A map that is not square takes the 4 that keep its sides.
Measured on the draw (seeds 1–100; it does not depend on the theme): all 8 appear, the most common
18% (genome 0), 17% (genomes 1 and 2).

### Names, how it plays, Another like this, Variety

- **Names** (`gen/names.ts`, D278 (1b)): from the standout, a few titles each ("Stair Lakes", "Relic
  Spire", "Oxbow Bend"), some with the land's noun (the theme's, the sea layout's, or for Any what
  the map shows most); chosen by the seed, never a title the names study forbids (official and
  workshop titles, real places: `src/core/data/forbiddenNames.json`). **How it plays**: the
  standout in the map's own numbers (each intention's check says what it found, "A river winds
  back and forth 12 times down the hill, dropping 5 levels at its bends.") and one thing read from
  the map (the start's water in the first drought, a dam site near the start, where the badwater
  lies, the woods). On the map card; the theme moves to
  the line under the name.
- **Another like this** (D278 (1c)): on the page beside Refine, and in the editor's menu. A sibling
  keeps the theme, settings and intentions and grows different land (the genome's variation, D143);
  its link carries `vr=` and `in=`. A sibling whose land matches the map it came from (85% of tiles
  within a level) is passed over for the next.
- **Variety** is a setting (`vy=`, 0–100, 70 the default; D276), beside Verticality.

### The game's own soil rules (D298)

`src/core/sim/columns.ts` and `soil3d.ts` are taken whole from `feature/terrain3d-a` at 62508d7d
(identical on both branches). `sim/soil.ts` `gameSoil` runs its game mode on one run per tile; the
build and the TypeScript validator's moisture, soil contamination and drought moisture use it;
`prototype/soil.py` is the Python validator's port (float32, one whole-grid update a tick),
bit for bit with the TypeScript. `tests/unit/soilGame.test.ts` holds the heightfield half of the 3D
branch's soil test (its cave half needs the stacked engine) and the Python parity.

Measured (`tools/soil-compare.ts`, the same maps with the old model and the game's; seeds 1–3 of
every theme at 128², and Any, River Valley and Islands seed 1 at 256²):

| Theme | Plants | Moved or changed | Old model's time / game's (mean, ms, under load) |
|---|---|---|---|
| Any | 5,980 | 1,745 (29%) | 19,852 / 18,641 |
| River Valley | 5,954 | 1,683 (28%) | 5,474 / 5,923 |
| Canyon | 4,937 | 1,580 (32%) | 21,166 / 17,905 |
| Highlands | 5,461 | 0 | 28,876 / 30,084 |
| Lake Basin | 5,947 | 1,964 (33%) | 17,271 / 14,268 |
| Delta | 7,085 | 4,334 (61%) | 12,716 / 14,992 |
| Islands | 6,161 | 0 | 25,576 / 25,555 |

Most of the moves are a cascade: planting draws over the moist land, so one tile of difference
shifts every later draw; where no tile's moisture crossed zero (Highlands, Islands here), nothing
moved. The time is the same within the machine's noise (game mode ~20 ms at 128²). Not yet on the
game's rules: the Real places conversion (`places/place.ts`), `planMapResources` (Real places and
Pick a place) and the editor's soil view; decisions-pending #109.

### The game's water rules (D293, D303, D308)

`sim/water.ts` runs the game's rules by default (`rules: "port"` keeps the port as it was, for the
tests): evaporation on every active tile, a dry one that receives water too; the spill threshold at
the map's edge (floor-0 tiles beside the padding; `edgeSpill`, taken from `feature/weather-days`);
a partial obstacle (NaturalDam) read from the higher of the two floors; the source step setting the
old depth. The game's fifth rule, direction limiters, needs a badtide drain's roofed cell, which a
heightfield cannot hold. `prototype/watersim.py` runs the same rules, bit for bit (every golden
fixture and the edge, dam and seep grids: 0 difference); the golden vectors are regenerated; the
speed-ups test keeps its port digests (still byte-exact) and pins the game's beside them.

**D297's line** (`tools/water-rules-band.ts`, information: the canonical settle, game against port, on the same
map's water model): 10 of 18 maps within (six themes, seeds 1–3, 128²). Outside: River Valley 2
(139 tiles, volume −0.36%), Lake Basin 3 (156 tiles, 0.057 → 0), Delta 3 (30 tiles, −0.85%),
Delta 1 and 2, Highlands 1 and 2, River Valley 3 (3–30 tiles). Taking the rules one at a time on
three of them, the dry-tile evaporation makes all of it (without it: 0 tiles, 0.000%); the edge
spill alone moves a few edge-row tiles from 0 to 0.1. Thin spreading films (0.04–0.09 deep) no
longer form, or take another way, since a dry tile loses 1e-3 a second before it wets. The game's
result is the line's own reference. **Accepted by Kyler (D311):** the game's water rules on open
ground stand although D297's line is missed where thin sheets form less; the pooled probe batch at
the release candidate checks the water against the game itself (decisions-pending #133). The band
tool stays as information.

**One switch, and a set Real places 2 can take** (the milestone session's coordination under
D308): the rules come as a self-contained set, `1c9d1340`, in which water and soil run the port's
rules unless a caller asks for the game's (`DEFAULT_WATER_RULES`, `DEFAULT_SOIL_RULES`: taking it
changes no map, checked on a clean `feature/m9a`: the 4242 sha unchanged, the oracle sample at 0
disagreements). `sim/water.ts` and `prototype/watersim.py`, `sim/soil.ts` and `prototype/soil.py`,
the build (`rules`), `validateMap` (`waterRules`, `soilRules`), and `prototype/validate.py`
(`--water-rules`, `--soil-rules`). M9b's own switch (`06e9bb87`) turns both defaults to the game's;
the Real places, converted under the port's water, settle with it (`place.ts`) until Real places 2
converts them under the game's.

**Sources in groups (D314)**, part of the same switch: `water/sourceGroups.ts` taken whole from
`feature/source-groups` (a6346fe4). The build places a river's inland spring and a lake's spring as
a group (a row across the flow at the head, 2–5 sources sharing the strength, fewer where the ground
is cramped); an edge river's mouth is the rule's row centred where its course crosses the edge, the
channel narrowed to it (`raster/terrain.ts` `mouthRow`, which the hydrology cuts and the build
seals; decisions-pending #134). Aquifers, set pieces' own springs and a badwater river's mouth are
unchanged; the generator places no other badwater springs (its badwater is the pits' set pieces).

**The one re-pin** (D148, D308): the water golden vectors (under the game's rules); the speed-ups
test keeps the port's digests and pins the game's beside them; `waterGame.test.ts` checks the two
languages bit for bit under the game's; `soilGame.test.ts`'s scene settles on the port's water, as
its pin was made; the 4242 download's sha; the map-bound tests re-seeded (listed below).

**Found by the re-pin:** a regeneration's badwater basin took the edge of a player's forest (its
clear square, 5 tiles either way of the pit's middle, reached past the tiles the planner kept off):
the planner now keeps that square off the player's features.

### The probe's two findings (D302)

Measured with the weather-cycle model the probe compares the game against, which followed the game
on both (`investigation/m9b/cycle-check.ts`: 3 temperate days, a 3-day drought, 3 temperate, a
3-day badtide; 10–40 s a map, no game):

- **Badwater refilling pools** (D273 (1), (5)): water over 10% badwater more than 3 tiles from the
  file's badwater, just before the badtide. On M9b's Any 128² seed 1, 40 tiles: refilling after the
  drought, the ditch (cut one below the ground beside it) rose over its banks and left a 0.1-deep
  sheet of badwater on the flat beside it. Ditches are now cut two below the ground beside them: 0
  tiles outside the way down on 15 maps (two Delta maps keep 2 tiles, within the probe's allowance).
- **A sheet in the badtide** (D273 (2)): tiles 0.05–0.12 deep a day into the badtide, dry in the
  file and more than 2 tiles from its water. Delta on M9b: 0–7 tiles (seeds 1–5). River Valley:
  284 and 491 tiles on seeds 1 and 4 (none on 3); Any 4 and 5: 65–77. It is the floodplain: the
  valley floor one level over the bed (PLAN §7.4), the channel running about 0.7 deep; after the
  drought the refill overtops onto the floor and leaves a film. **Kyler's answer (D307):** a floor
  one level over its bed that floods when the river refills or in a badtide is a floodplain, as the
  game plays it; the floor rule and the channels' depth stay (decisions-pending #132).

### Chaos (D273 (6))

Any at Variety 100 and Verticality 100 (`tools/batches.ts --set "vy=100&vt=100"`, 4 jobs, the
results in `investigation/m9b/local/chaos/`):

| Size | Seeds | Final | First attempt | Attempts (mean) | Time a map (median / p90 / max) |
|---|---|---|---|---|---|
| 128² | 100 | 98% | 17% | 5.4 | 15 s / 41 s / 78 s |
| 256² | 50 | 98% | 14% | 6.3 | 102 s / 200 s / 354 s |

**Breakage found and fixed:** 16 of 147 accepted maps' project files did not reopen: on land above
16 a river's natural fall can drop more than 15 levels, and the feature schema's bed step allowed
15 (its start already 22). A bed step's drop now goes to 22, as its start (`features.schema.json`);
the waterfall set piece keeps its own 15 (PLAN §9.10); two of the maps re-checked reopen and rebuild
byte for byte. The time at 256² is too long (most attempts refused after their settle: the course
check, the start, the water settling).

## Tools

- `tools/look.ts` (+ `look-grid.py`): chosen maps drawn large with their water story, signature,
  outcomes, intentions and name; `--systems`, `--paths`, `--intention <id>`.
- `tools/intention-rates.ts`: each intention forced on the same seeds, how often it emerges.
- `tools/soil-compare.ts`: D298's report.

## Tests updated because a decision changed what they tested

- 2026-10-02, step 4's re-pins (D148; each test carries its reason): `brush` (the pit 14 tiles from the
  start on the side on the map; the ramped flatten on River Valley 96² seed 2), `carve` (Highlands 96²
  seed 8 with carve seed 4; its settle checks use `SETTLE_DAYS`, D358), `look-mine-ruins` (4242 sha
  `94057d2b…`), `look-waterfalls` (Highlands 4, Lake Basin 5), `narrows` (River Valley 128² seed 1),
  `objects` (a second district on Canyon 4; ruins on a rise on Highlands 2 and 7, River Valley 2, Canyon
  3; weirs on Canyon 1 and Highlands 1; every object on, seed 4), `projects` (Lake Basin 96² seed 5),
  `versions` (River Valley 96² seed 2), `smallStarts` (Canyon 128² seed 9's outcome, traded by round 2);
  `dev`'s `clearSourcesWater` (seed 1), `describeTile` (seed 2), `draftWaterQuiet` (Lake Basin seed 8),
  `editsPlaceNothing` (Quake Lift on seed 4; the walled mine site's ring on the map), `forceOps` (seed
  4), `glaciatePowerSize` (the head at (80, 24) on seed 21), `maxWaterDepth` (seed 2),
  `naturalizeWeathers` (seed 1), `firstVisit` (Canyon seed 5), `strokesBeforeD322` (the 0.7.0 project's
  objects under D308's rules switch: its entities digest); the browser specs `waterView` (seed 8),
  `editor` (4262), `brushSources` (Highlands 4244), `forceKeys` (the spot clear of the options bar),
  `look-high` (Lake Basin seed 5), `brushKit` (seed 36), `tooltips` (the mine site on its own dry spot);
  the force sweep's `KNOWN` (Quake's slide on Delta's plain and Islands' sea edge, by theme, D356).
  New: `tests/contract/riversZero.test.ts`.
- 2026-10-02, the merge with `dev`: `tests/contract/editsPlaceNothing.test.ts` looks for
  `resources.mine_site` (the editor's advisory, `resources.mine_reach` folded into it, D342) and
  `parity.test.ts` compares every check again; `resources.test.ts`' grove fill is read on the map's
  own groves beyond the start's 25 tiles (item 26: the start's living-only planting packs scarce
  moist ground); `rivers.test.ts`' drawn rivers skip every size under D277 (the drawn-river planner
  gets the source rule's mouth row, not the edge lip); `brush.test.ts` keeps `dev`'s D270 name with
  M9b's seed 1; `tests/e2e/editor.spec.ts` keeps `dev`'s file name (`dgm-river-valley-4261.timber`)
  and its Delete on the river (one level of ground) with M9b's seed and hover tile. New:
  `tests/contract/smallStarts.test.ts`, `tests/unit/mineGround.test.ts` (#153).
- `tests/contract/spec.test.ts`: the codec's round trip draws Variety too (D276: a setting).
- `tests/unit/genome.test.ts`: "draws zero, one or two intentions" is now "draws one or two
  intentions, never none" (D273 (3): every map has a character).
- `tests/contract/live-water.test.ts`: a regeneration whose own map passed takes the attempts its
  candidate choice takes (D278 (1a)), fewer than every layout, instead of exactly one.
- `tests/e2e/editor.spec.ts`, `tests/e2e/legend.spec.ts`: the editor's heading and the page's
  caption name the map by its own name (D278 (1b)), read from the card, not "River Valley".
- `tests/contract/ops.test.ts`: the placed Blockage goes on a free tile found on the map, not at
  (40, 3), which 0.8.0's map of seed 77 covers.
- `tests/contract/shelf.test.ts`: the painted grove is counted on its own tiles and removed within
  its own bounds (a pine of the map's own a few tiles off made the count the map's luck); seed 18.
- Re-seeded for 0.8.0's maps and the game's rules (D148): the badwater test (seed 22), every object
  on (seed 2), a second district's site, ruins on a rise, the weir, the builders' ranges (seed 7),
  the narrows (seed 5), the 16-level fall (seed 7), the oxbow carve (Canyon 22), the tall river's
  reopen (Highlands 10), the edge lake (Lake Basin 6), two brush strokes (seed 4); the 4242 sha.
- Batch 5 (D325, D329), decisions: `spec.test.ts` rejects Highest terrain above 22, not 16 (item
  36), and its round trip draws 2–4 mine sites; `start.test.ts` and the Python `calibrated.py`:
  Hard's berries 30 (item 47); `resources.test.ts`: mine sites two to four, a project or link asking
  for 0 or 1 opens asking for 2, every generated map has two, and "the official amounts" counts
  living trees against the official living share with dead trees under a tenth (item 26; it was
  "two thirds dead"); `validate.test.ts`: the map without objects asks for two mine sites;
  `projects.test.ts`: the deep fall is a bed step of 19 on the map's tallest river (the beds' floor
  makes a generated one rare), the edge lake Lake Basin 96² seed 8; `brush.test.ts`: the ramped
  flatten's spot among living trees (dry ground holds no dead groves); `places.test.ts` and
  `placesCommon.ts`: the start's farmland and level land known for real places (D331); new:
  `tests/unit/edgeLip.test.ts`, `tests/contract/versions.test.ts`.
- Batch 5, re-seeded for its maps: the oxbow carve (Canyon 96² seed 44, (86, 10) toward (10, 86)),
  the removed slope (one the edits leave), the weir (Canyon 4, 6, 7, 16, Highlands 2), the second
  district (Islands 2, 8, Lake Basin 2, River Valley 4), ruins on a rise (Islands 10, 6, Highlands
  13, River Valley 7), the badwater river (River Valley 128² seed 3), the builders' ranges (seed
  13), the dropped source (River Valley 96² seed 2); the 4242 sha `050fe985…`.
- D333, decisions: `versions.test.ts`: only a missed theme promise gets a note (D333 (5)); the
  settings suite (`tools/settings-suite.ts`, the nightly's `settings.test.ts`): Drought reserve on
  12 seeds (its per-map storage spans 0–3,500; the target unchanged), Relief moves at
  least 2 levels (the base raise leaves 12 of the 15), Badwater distance at least 6 tiles (item 47's
  pits stand off the lowest ground and keep short ditches), Forest density at least 250 living trees
  (item 26), Mine sites 2 → 4 (item 47's two); `objects.test.ts`'s second district walks round the
  objects that block the way. New: the probe's water check on a dry map (`investigation/probe`
  self-test), the response's `walkReach` and `levers` (`levers.test.ts`).
- D333, re-seeded for its maps: every object on (seed 3), the second district (Islands 2, River
  Valley 3, Canyon 2, River Valley 4), ruins on a rise (Islands 1, 4, Highlands 13, Any 6), the weir
  (Canyon 6, 7, 10, 16, Highlands 2), the resource areas' map (River Valley 128² seed 78), the ramped
  flatten (River Valley 96² seed 1), Naturalize's Canyon (seed 2), the oxbow carve (Highlands 96²
  seed 2, (48, 86) toward (48, 10): no Canyon seed to 400 seals its lake on D333's maps), a group of
  operations deletes any tree (the map has no birch), the fall lips' Highlands (seed 5; seeds 1 and 3 miss by 4–10× at one
  lip on the maps before D333 too, a look finding), the edge lake (Lake Basin 96² seed 3), the
  background version (River Valley 96² seed 1); the 4242 sha `9644dc88…`; the browser specs: the 3D
  view's legend (4247: 4242's map has no dead tree), smart Lower (seed 2), the editor's round trip
  (4261: 4254's moved start has little wood and plants a drought dries), the hover readout (a tile
  of the start's pad: (40, 40) is water), the water view (seed 33: seed 15's river takes a tributary
  above the point it reads).

- D348: `investigation/probe/runner/test.ts`'s start-water check (every pool a pump reaches counts,
  not only the nearest) sinks its one-tile pool beside the start itself: the generator no longer
  leaves Canyon 128² seed 1 its sealed hole (D148). New: `tests/contract/firstLand.test.ts`, a shown
  land is never replaced (Highlands 3 and 7, Any 4, Islands 7 at 128², whose land D333 replaced).
- D358: `tests/unit/water-speedups.test.ts` re-pins seep_pit's and evaporation's digests (their water
  never settles, so their canonical settle runs to the 6-day limit; the 975 ticks are unchanged);
  `tests/unit/sealedBasins.test.ts`'s evaporating lake runs to `SETTLE_DAYS`; the golden vectors
  (`tests/golden/water.json.gz`) are regenerated by the Python oracle. New:
  `tests/unit/settleDays.test.ts`, `tests/unit/pathField.test.ts`.
- D360 (3): `tests/unit/outletWear.test.ts`'s worn channel changes width smoothly (it asked for a
  ragged one), and checks the cut is one shape (`cutShape`), refusing Lake Basin 8's and Lake Basin
  4's old cuts.
