# In-game log

The in-game checks of [PLAN.md §18](../PLAN.md#18-in-game-checklist), by milestone. **They are
deferred (PLAN §20, D11).** Kyler is skipping in-game checks for now, so milestones list here the
checks they would have needed, marked *pending*, with the files to play. Nothing waits for them:
the automated validation and tests (PLAN §15) carry each milestone's gate until the checks are
played.

**DGM Probe batches** (PLAN §20, D116, D117) are the exception: the probe plays maps in the real
game unattended. Claude launches a batch only after asking Kyler in chat and getting Kyler's yes,
every time (CLAUDE.md, Standing rules). A batch's results go into the tables below as **pass
(probe)** or **fail (probe)**, with the date and the run. The batches planned so far are listed
under "DGM Probe batches" at the end.

When you play one, change its status to **pass** or **fail**, and add the date and what you saw.
A failure becomes an issue and, if it changes a rule, a PLAN §20 decision.

**Installing a map:** copy the `.timber` file to `Documents\Timberborn\Maps`, then start
Timberborn. The map is listed under New game.

**Coordinates:** x runs west to east, y runs south to north, and (0, 0) is the south-west corner.
Each preview PNG is drawn north up at 5 pixels per tile, with a dotted white grid every 16 tiles.

## M1: shared core and end-to-end slice

The files are in [out/m1/](../out/m1/), made with generator 0.1.0 (tag `m1-done`). Remake them
from that tag with `npx tsx tools/ingame-files.ts`: the bytes are deterministic, and
[out/m1/checks.txt](../out/m1/checks.txt) lists their sha256, the start, every slope and every
source. (Generator 0.2.0 changes every map; `--milestone m1` writes the same set with it.)

- **`River Valley (4242).timber`:** 128 × 128, seed 4242, Normal, generator 0.1.0.
- **`River Valley (4242).png`:** a preview of that map:
  - start: white 3 × 3 square, with the door tile in red;
  - slopes: orange, with the tile on their high side in brown;
  - river-mouth sources: blue, on the west edge.
- **`River Valley (4242) F2 source gap.timber`:** the same map with the middle river-mouth source
  (0, 79) removed.
- **`River Valley (4242) F2 source gap.png`:** a preview of the gap file, with the gap tile in
  magenta.

The water in these files is zero (PLAN §7.6; M2 adds pre-settled water), so the river fills from
its sources during the first minutes of play.

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| A1 | Copy the file to `Documents\Timberborn\Maps` and open New game. | The map is listed as "River Valley", with its thumbnail and description. | `River Valley (4242).timber` | pending |
| A2 | Start Folktails on Normal. | There is no "Loading issues" panel. The district center stands on the white square of the PNG, at StartingLocation (37, 31), with its door facing north towards the river (door tile (36, 32)). 9 adults and 4 children spawn. | `River Valley (4242).timber` and `.png` | pending |
| A3 | Walk test: send a beaver up a 1-level terrace edge with no slope, then up and down a generated slope. The slope at (36, 37), 6 tiles north of the start, leads down towards the river. | The beaver can't step up the edge without a slope. It climbs each slope both ways. | `River Valley (4242).timber` | pending |
| A4 | Open the map in the in-game map editor. Raise and lower some terrain, then save. | The map opens without errors, the edits work, and the map saves and reopens. | `River Valley (4242).timber` | pending |
| A5 | Start Iron Teeth once. | The district center fits on the start, and the beavers spawn. | `River Valley (4242).timber` | pending |
| F2a | Play the unmodified map for about a day. Watch the west edge where the river enters (sources at (0, 77)–(0, 81)). | The river fills and keeps its water. Nothing drains back off the west edge. | `River Valley (4242).timber` | pending |
| F2b | Play the gap file for about a day at the same spot. | Water drains back off the edge through the gap at (0, 79). Compared with F2a, the river is lower or stops downstream. This confirms that river mouths must be sealed with a source on every channel tile. | `River Valley (4242) F2 source gap.timber` | pending |

**Automated stand-ins used meanwhile (all green at M1):**
- the `generate` validation profile: load and design classes, including placement emulation, start
  entrance, slopes and terrain support;
- the Python oracle, [`tools/oracle.ts`](../tools/oracle.ts): 50 seeds × 3 sizes pass
  `prototype/validate.py --load-only` and `prototype/roundtrip_test.py`;
- byte-identical output in Node and Chromium (`tests/e2e/determinism.spec.ts`).

## M2: water, playability and validation profiles

Checks B1–B4 of PLAN §18: pre-filled water, tree survival, the A/B file with empty water, and
badwater staying downstream. The files are in [out/m2/](../out/m2/), made with generator 0.2.0.
Remake them with `npx tsx tools/ingame-files.ts --milestone m2`; [out/m2/checks.txt](../out/m2/checks.txt)
lists their sha256 and every coordinate below.

- **`River Valley (4242).timber`:** 128 × 128, seed 4242, Normal. Water, soil moisture and soil
  contamination are pre-filled with the canonical settle (PLAN §19.7), as official maps ship.
- **`River Valley (4242) (empty water).timber`:** the same map with no water, moisture or
  contamination in the file. The website offers it as "Without pre-filled water".
- **`River Valley (4242).png`:** north up, 5 pixels per tile, grid every 16 tiles:
  - water blue, badwater brown;
  - start white, door red;
  - living trees green, dead trees grey-brown;
  - living berry bushes within 20 tiles of the start purple;
  - the badwater source (3 × 3) and its ditch magenta;
  - the best dam site orange;
  - the river depth samples and the nearest pumpable water cyan.

What the files should show (from `checks.txt`):
- The start: StartingLocation at (47, 30), door (46, 31). The nearest pumpable clean water is
  (42, 38), 0.49 deep, 9.2 tiles away.
- River depths after the settle, west to east:
  - (2, 78) 0.49;
  - (32, 45) 0.42;
  - (58, 53) 0.46;
  - (83, 64) 0.42;
  - (109, 89) 0.75, badwater 81%;
  - (125, 67) 0.68, badwater 40%.
- 77 living berry bushes within 20 tiles of the start, for example (37, 33)–(40, 33).
- Living groves: 139 Pine around (34, 27), 70 Birch around (58, 63), 64 Pine around (22, 86)
  and 49 Oak around (71, 64). Dead stands: 98 Pine around (56, 121), 53 Pine around (120, 2),
  32 Oak around (10, 115) and 31 Birch around (72, 2).
- The badwater source at (107, 93)–(109, 95), strength 2.34, in a pit whose 2-tile ditch runs
  into the river near the east edge. The nearest badwater or contaminated soil is 81 tiles from
  the start.
- The map has no natural lake (the basin behind the gorge stays dry until the player dams it), so
  B1's "lake levels" means the river's pools between the falls.

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| B1 | Start Folktails on Normal with the pre-filled file and watch the first day. Compare the river with the PNG and the depth samples. | The river runs from the first tick, with no surge from the sources and no drain toward the edges. The pools between the cascade, the gorge and the falls keep their level through the day. The depths at the sample tiles are close to the listed values. No berry bush within 20 tiles of the start is flagged dry. | `River Valley (4242).timber`, `.png` | pending |
| B2 | Start the `(empty water)` file the same way. | The river fills from the west edge within about a day and then looks like the pre-filled file. The same trees and bushes survive (a dry timer that starts before the water arrives resets). | `River Valley (4242) (empty water).timber` | pending |
| B3 | Play either file for 15 days. | The living groves listed above are alive, and so are the berry bushes near the start. The dead stands are still dead and can be cut for logs. The first drought, if it comes in these days, is short and nothing near the river dies. | `River Valley (4242).timber` | pending |
| B4 | Watch the badwater source at (107, 93) and the river below it. | The badwater stays in its pit, the ditch and the river downstream of it, and leaves off the east edge. The water at the start (42, 38) stays clean. | `River Valley (4242).timber` | pending |

**Automated stand-ins used meanwhile (all green at M2):**
- the water port against the game's own save: 975 ticks from empty reproduce its water within
  0.001, with the same 470 wet tiles (`tests/unit/water.test.ts`, local only);
- the golden fixtures against the Python reference, bit for bit after 50, 200 and 975 ticks;
- the `generate` profile, now with every playability check (PLAN §11.3–11.4);
- the Python oracle: both validators agree check by check on 50 generated maps and the 19 official
  maps (`npm run oracle`).

## M5: set pieces, land and water tools, slopes, fixes

Checks C1–C3 and F1 of PLAN §18, on maps edited with the M5 tools. The files are in
[out/m5/](../out/m5/), made with generator 0.3.0 from River Valley seed 4242 at 128 × 128. Remake
them with `npx tsx tools/ingame-files.ts --milestone m5` at commit 180d914 (tag m5-done): every
edit is planned by the editor's own code with fixed ids, so the bytes reproduce. From generator
0.4.0 (M6) the tool makes different maps, so test the committed files. [out/m5/checks.txt](../out/m5/checks.txt) lists their
sha256 and every coordinate below.

- **`River Valley (4242) F1 waterfall S2.timber`:** a standalone waterfall 20 tiles wide, falling
  north, fed by 2 water/s (4 springs of 0.5 in its header pool).
- **`River Valley (4242) F1 waterfall S8.timber`:** the same fall fed by 8 water/s (16 springs),
  the exact flow set by hand: more than the map's whole Normal flow of 3.6.
- **`River Valley (4242) C1 dam site.timber`:** a dam site added on the river's lower reach.
- **`River Valley (4242) gorge stairs.timber`:** a tributary drawn from the south edge into the
  main river, with a gorge where it cuts through high ground and a stair notch down to the water.
- **One PNG per map** (north up, 5 pixels per tile, grid every 16 tiles): water blue, start white
  with its door red; the waterfall's lip magenta, its springs blue and its outflow cyan; the dam
  line orange; the notch's slopes orange with their high side brown.

What the files should show (from `checks.txt`):
- The start: StartingLocation at (47, 30), door (46, 31), on every map.
- The waterfall's lip runs from (55, 118) to (74, 118) at level 15, over a plunge pool at level 9
  (rows y 119–122). The port wets all 20 lip tiles: 0.030 deep at 2 water/s and 0.120 deep at 8.
  Its outflow runs 5 tiles north to the map edge; a water wheel fits on it at (75, 123).
- The dam site's gap is the 10 tiles (83, 63)–(83, 72), on a river bed at level 8. A dam 2 high
  there should hold about 2,900 water over about 2,270 tiles; the colony needs about 380 through
  the first Normal drought.
- The generated river's own falls are at (40, 39) and (88, 76), each a drop of 2.
- The gorge runs from about (66, 14) to (66, 26). Its notch climbs west from a landing beside the
  water at (65, 20)–(64, 20), with slopes at (64, 20), (63, 20) and (62, 20), to the ground at
  (61, 20), level 13.

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| C1 | Build a dam 2 high (or levees) on the 10 gap tiles (83, 63)–(83, 72) of the dam site's ridge. Watch the basin fill over a few days. | The basin upstream fills to about level 10 and stays there. No water leaks round the ridge's ends. | `River Valley (4242) C1 dam site.timber`, `.png` | pending |
| C2 | Place a water wheel just below one of the generated river's falls, at (40, 39) or (88, 76). | It turns. | any of the four files | pending |
| C3 | Play the dam-site map on Normal to the first drought, drinking from the dammed basin. | The colony survives the drought on the stored water. | `River Valley (4242) C1 dam site.timber` | pending |
| F1 | Look at the waterfall in both files. Put a water wheel on its outflow, at (75, 123). | Record whether the 2 water/s sheet reads as a waterfall, and whether each wheel turns. The answer sets the waterfall flow policy (PLAN §9.2, D6). | `River Valley (4242) F1 waterfall S2.timber` and `S8.timber` | pending |
| C-gorge | Send a beaver down the gorge's stair notch, from the ground west of the gorge at (61, 20) to the landing by the water at (65, 20), and back. Build a water pump on the landing. | The beaver walks down and up the slopes. The pump reaches the water. | `River Valley (4242) gorge stairs.timber`, `.png` | pending |

**Automated stand-ins used meanwhile (all green at M5):**
- the set-piece range tests (`tests/contract/setpieces.test.ts`): a 20-wide fall keeps all 20 lip
  tiles wet at 96², 128² and 256², is reduced to 19 on 48², and drops above 15 are reduced;
- the drawn-river property test (`tests/contract/rivers.test.ts`): rivers drawn in random
  directions drain, carry water along their whole course, and keep their mouths sealed;
- the `export` profile on every file above: no load problem, no warning;
- the Python oracle: both validators agree on 50 generated maps and the 19 official maps.

## M6: full settings, sharing, themes I

Check M6-1: the two new themes load, and their dam sites hold. The files are in
[out/m6/](../out/m6/), made with generator 0.4.0, seed 4242 at 128 × 128, designed for Normal,
every setting at its theme's preset. Remake them with
`npx tsx tools/ingame-files.ts --milestone m6`; [out/m6/checks.txt](../out/m6/checks.txt) lists
their sha256 and every coordinate below. The same maps open on the website from a link:
`#s=4242&t=canyon&z=128&d=n` and `#s=4242&t=lakeBasin&z=128&d=n`.

- **`Canyon (4242).timber`:** a river in a canyon 4–6 levels deep, a dam site in a narrows, and a
  stair of slopes up the canyon wall beside the start.
- **`Lake Basin (4242).timber`:** a lake in the middle, rings of terraces round it, and a dam site on
  the lake's outlet to the east.
- **One PNG per map** (north up, 5 pixels per tile, grid every 16 tiles): water blue, badwater
  brown, start white with its door red, the dam line orange, the stair's slopes orange, badwater
  sources magenta.

What the files should show (from `checks.txt`):
- Canyon: StartingLocation at (42, 54), level 8, door (41, 55). The dam site's gap is the 4 tiles
  (66, 61)–(66, 64), on a river bed at level 6. A dam 2 high there should hold about 844 water over
  685 tiles; the colony needs about 380 through the first Normal drought. The stair's six slopes
  are at (48, 47) to (53, 47), levels 7 to 12, climbing east. The badwater source is at (82, 43),
  in a basin whose outlet joins the river below the dam site.
- Lake Basin: StartingLocation at (68, 97), level 10, door (69, 96), on the shore bench. The lake
  stands at about level 9. The dam site's gap is the 5 tiles (113, 59)–(113, 63) on the outlet. A
  dam 1 high there should raise the lake to about level 10: about 13,500 water over 3,622 tiles;
  the colony needs about 759 (this theme's reserve is Plenty). The badwater source is at (26, 104),
  in a basin whose outlet runs to the west edge.

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| M6-1a | Load the Canyon map. Build a dam 2 high (or 2 levees stacked) on the 4 gap tiles (66, 61)–(66, 64). Watch the canyon floor fill over a few days. Send a beaver up the stair at (48, 47)–(53, 47) to the rim and back. | The map loads with no issues. The floor behind the dam fills to about level 8 and stays there; no water leaks round the ridge. The beaver walks up and down the stair. | `Canyon (4242).timber`, `.png` | pending |
| M6-1b | Load the Lake Basin map. Build a dam 1 high (or one levee) on the 5 gap tiles (113, 59)–(113, 63). Watch the lake for a few days. | The map loads with no issues. The lake rises about one level to level 10 and stays there; no water leaks round the ridge; the start's bench at level 10 stays dry. | `Lake Basin (4242).timber`, `.png` | pending |
| M6-1c | Block the badwater basin's outlet, 3 tiles wide, with levees where its channel leaves the basin: Canyon (87, 46)–(87, 48), the channel running east; Lake Basin (26, 101)–(28, 101), the channel running south. | No badwater leaves the basin until it fills to its rim (a source never stops, so it spills over the rim later). | `Canyon (4242).timber`, `Lake Basin (4242).timber` | pending |

> **Note (2026-09-25):** the dam sites in C1 and M6-1a/b are the built dam-site ridges that Kyler's no-dam-ridge decision removes from M9a on (PLAN §20 D111). The files still load and can still be played as they are, but the ridge itself is no longer something to judge.


**Automated stand-ins used meanwhile (all green at M6):**
- the batches: 100 seeds per theme at 96², 128², 192² and 256² pass the generate profile (every
  playability check, including `water.reservoir` on the dam site and `water.badwater_contained`);
- the share-link tests: links open the same bytes in Node and in Chromium;
- the Python oracle: both validators agree on 50 generated maps of the three themes and the 19
  official maps.

## M7: resources, map objects, themes II

Check D: the 1.0 objects load, and a spillway's plug releases its water. The files are in
[out/m7/](../out/m7/), made with generator 0.5.0: the Lake Basin map for seed 4242 at 128 × 128,
designed for Normal, with two edits made with the M7 editor tools (a weir and a thorn belt). Remake
them with `npx tsx tools/ingame-files.ts --milestone m7`; [out/m7/checks.txt](../out/m7/checks.txt)
lists their sha256 and every coordinate below.

- **`Lake Basin (4242) D objects.timber`:** the generated map already has a plugged spillway, two
  mine sites, two geothermal fields, a small relic and a medium relic. The Weir tool added a
  natural dam across the north-west inflow river; the Thorn belt tool added a belt of thorns east
  of the start.
- **`Lake Basin (4242) D objects.png`** (north up, 5 pixels per tile, grid every 16 tiles): water
  blue, badwater brown, start white with its door red, Blockage (the plug) magenta, NaturalDam (the
  weir) cyan, Thorns dark red, relics yellow, geothermal fields orange, mine sites purple, the
  spillway's channel dark blue dots.

What the file should show (from `checks.txt`):
- StartingLocation at (68, 97), level 10, door (69, 96).
- Blockage, the spillway's plug: 3 tiles at (54, 33), (55, 33) and (56, 34), on the lake's south
  shore. The lake's sill is at level 9. The spillway is 3 wide, its bed at level 8, and runs 35 tiles
  to the south edge.
- NaturalDam, the weir: 5 tiles at (10, 87), (11, 88), (12, 89), (12, 90) and (13, 90), across the
  north-west inflow river. It holds the water about 0.65 above the river bed upstream.
- Thorns: 32 in a belt within (92, 96)–(102, 100).
- Small relic at (17, 107)–(17, 108). Medium relic at (118, 110)–(120, 111).
- Geothermal fields at (33, 5)–(35, 7) and (110, 16)–(112, 18).
- Mine sites (UndergroundRuins) at (18, 9)–(22, 13) and (112, 3)–(116, 7).

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| D1 | Load the map (Folktails, Normal). Look at each object on the PNG. | There is no "Loading issues" panel. Every object listed above is there, and none is missing. | `Lake Basin (4242) D objects.timber`, `.png` | pending |
| D2 | Watch the weir at (10, 87)–(13, 90) for a day. | Water stands about 0.65 deeper upstream of it, and flows over it. | `Lake Basin (4242) D objects.timber` | pending |
| D3 | Send a beaver to walk through the thorn belt at (92, 96)–(102, 100), then mark the thorns for removal. | The beaver walks round the thorns. Builders clear them. | `Lake Basin (4242) D objects.timber` | pending |
| D4 | Demolish the relics, and build a geothermal engine on a geothermal field. Check that the mine sites take the scrap mine. | The relics give science when demolished. The engine and the mine can be placed on their sites. | `Lake Basin (4242) D objects.timber` | pending |
| D5 | Demolish the 3 Blockage tiles of the plug at (54, 33)–(56, 34). Watch the lake for a few days. | The lake drains down the spillway to the south edge. It falls about one level, to about level 8, losing about 3,290 water, then keeps that level. | `Lake Basin (4242) D objects.timber` | pending |

**Automated stand-ins used meanwhile (all green at M7):**
- `entities.placement` (the loader's rules, in TypeScript and in `prototype/validate.py`) passes on
  this file and on every generated map of the six themes;
- `extras.placement` (level, dry, away from floods, in the distance bands) passes on this file;
- the contract tests: a weir and a plug close a river's channel wall to wall; a plugged spillway
  drains its lake only over its plug.

## M8: water preview and background validation in the editor

The files are in [out/m8/](../out/m8/), made with generator 0.6.0. Remake them with
`npx tsx tools/ingame-files.ts --milestone m8`; [out/m8/checks.txt](../out/m8/checks.txt) lists
their sha256, every coordinate and water samples to compare. The two imported maps are not ours to
share: the tool writes them to `out/m8/local/` from your own copies in `investigation/raw/`, and
only the edits are committed.

- **`River Valley (4242) M8 preview.timber`:** seed 4242, 128 × 128, Normal, with three edits made
  with the M8 editor: a 9 × 9 lake with its spring east of the start, ground lowered one level
  beside the river in the south-west, and a weir across the river in the east. It is exported with
  the canonical settle. **`.png`:** water blue, the start white (door red), the lake's basin yellow
  dots, the lowered ground magenta dots, the weir cyan.
- **`local/Canyon (M8 edited).timber`** (F4): the official Canyon with a lake drawn on dry ground,
  10+ tiles from any cave or overhang. Its 228 columns under roofs keep the map's own water.
- **`local/Cozy Secret Valley (M8 edited).timber`** (F3): the pre-1.0 workshop map (its 6 sources
  halved on import), with ground lowered one level beside its river, away from its caves.

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| M8-1a | Load the River Valley map. Let it run a day. Look at the lake, the lowered ground and the weir (checks.txt gives the tiles and the water depth the editor showed). | The water stands where the editor showed it, within about 0.1 deep. The lake fills to about its level, the weir holds the river about 0.65 up. | `River Valley (4242) M8 preview.timber`, `.png` | pending |
| M8-1b, F4 | Load the edited Canyon. Look at the new lake, then at the tunnels under the cliffs. | The lake fills from its spring. The tunnels keep flowing as in the original Canyon. | `local/Canyon (M8 edited).timber` | pending |
| M8-1c, F3 | Load the edited Cozy Secret Valley next to the original from the Workshop. | Its rivers run at the same level as the original's: the halved sources are right. The lowered ground fills as the editor showed. | `local/Cozy Secret Valley (M8 edited).timber` | pending |

Record every difference as a PLAN §20 decision ("Editor decisions").

**Automated stand-ins used meanwhile (all green at M8):**
- validation parity: the editor's verdicts after its preview and the canonical settle equal the
  generator's validator on the exported file, check by check, and its map equals a full build
  (`tests/contract/parity.test.ts`);
- the canonical settle in slices gives the same bytes as the one-go settle;
- the roofed-water export keeps every slot of the file's water under roofs (the round trip of the
  edited Canyon and Cozy Secret Valley above);
- the preview after a local edit differs from the canonical settle by at most 0.19 deep on any tile
  at 256² (`tools/bench-preview.ts`).

## Map look: a reference screenshot

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| ML-1 | When you play your first in-game check, screenshot the same map in Timberborn from the default camera angle. | Map look (ROADMAP, PLAN §20 D86) compares its colours, lighting and water with it. Keep the screenshot out of the repository: game screenshots are never shipped. | the map of your first check (seed 4242) | **received** 2026-09-25: ten in-game screenshots, kept on Kyler's machine only (`C:\dgm-reference\`), used to tune Map look's ground, walls, water, light and models (PLAN §20 D110). Never copied, committed or shipped |
| ML-2 | Open the map in Timberborn, and the same file in Dam Good Maps (**Open a map**, then look in 3D). Compare the ground near the start and along the river. | Where the game shows grass, the 3D view shows moist ground; where it shows cracked earth, dry ground; where badwater has spoiled the soil, contaminated ground. The badwater itself is clearly water in both. | `out/m8/River Valley (4242) M8 preview.timber` | pending |

## M12: Claude integration

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| M12-1 | Play the map produced by "add a giant waterfall in the north part of the map that is roughly 20 blocks wide". | The waterfall is there, about 20 wide, in the north, and it flows. | set by M12 | pending |
| M12-2 | Play the map produced by the compound request: "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." | The start stands upstream and reaches its water; a dam at the site halfway down holds its reservoir; the badwater runs on the far bank and stays out of the start's water and the reservoir. | set by M12 | pending |

## M13: usability, problem reports, versioned deploys

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| M13-1 | The full journey of EDITOR_PLAN §9 task 7: generate, refine, ask Claude, export, load in Timberborn. | The exported map loads and plays as edited. | set by M13 | pending |

## Any time: open questions from the investigation (PLAN §18 E)

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| E1 | Load a map with terrain above 16 in the editor. | Record whether the editor loads and edits it. The game's side passed (P-V16, below). | any map with terrain 17–22 | pending |
| E2 | Walk a beaver into a ruin column. | Beavers walk through ruin columns, as the code says. | `River Valley (4242).timber`: the website preview of seed 4242 outlines its ruin fields | pending |
| E3 | Run an aquifer with a powered drill during a drought. | Record whether it yields water. | any map with an aquifer | pending |
| E4 | Start a new game on a map with no StartingLocation. | Record what happens, for the error message. | needs a hand-made file | pending |

## DGM Probe batches

Each is launched only with Kyler's yes for that batch (D117). One exception, the night of 2026-09-26 only: Kyler pre-approved any batch prepared that night, with every usual safeguard (settings backed up and verified, saves and mods untouched, results in `C:\dgm-probe`, Steam running and Timberborn closed); from the next day, each batch needs his yes again. The probe (PR #18) is merged; each
run keeps its results in `C:\dgm-probe\` (D149).

| Batch | Step | What it must show | Status |
|---|---|---|---|
| P-M9a | M9a's gate (D116) | M9a's maps load, their pre-filled water holds, their objects load, and droughts and badtides behave as the models predict, within tolerances stated before the run; the probe's review of its screenshots finds nothing visibly broken. | pending (M9a) |
| P-V16 | M9a, Verticality above 16 (D132; E1 below) | Maps with terrain above 16 load, and keep their terrain, water and objects (the Probe's T6). M9a offers heights above 16 only after it passes. | passed 2026-09-25 (run 20260925-tall, with Kyler's installed mods): 4 maps, Highlands 128² lifted to 22, Lake Basin 96² with the start at 22, Canyon 128² with a summit lake and springs at 19 and 22, and Yosemite 96² stretched to 22; 23 checks passed, 0 failed. After 1.5 days every tile's terrain and every object matched the file, the water above 16 stayed within 0.1 and its sources ran; the screenshots are whole. Both validators allow up to 22 (D172 (1)). |
| P-ML | Map look (D135) | The DGM Probe's in-game shots of the Map look maps from the 3D view's poses, for Kyler to judge the clean look beside them. Kept local, never committed. | pending (when the probe exists) |
| P-RP | Real places (D136), optional | A few of the real-terrain maps load in the game. Only if Kyler approves a batch. | optional |
| P-3Db | 3D-b (D127) | T1–T4 and T6 agree with the model within the tolerances stated before the run (investigation/terrain3d/DESIGN.md §8). | pending (3D-b) |
| P-3Dc | 3D-c (D127) | T5, and T2 on edited maps. | pending (3D-c) |
| P-WV | Weather view (D133) | The weather model's calibration: droughts and badtides in the game against the model on the same maps. | pending (Weather view) |

## 3D-b: Kyler's play test

| Check | What to do | What should happen | File | Status |
|---|---|---|---|---|
| T7 | A DGM Probe batch of high-verticality maps before 3D-b's public release (D127, as amended by D145: a probe batch, like M9a's gate, instead of Kyler playing two maps; ask Kyler before launching). | They load and play: the start works, the heights are reachable as planned, the caves and overhangs hold. | set by 3D-b | pending |
