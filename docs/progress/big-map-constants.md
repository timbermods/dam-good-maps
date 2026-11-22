# Constants sized for 128² on bigger maps

Planning's brief of 2026-11-21: every constant in tiles or absolute numbers that does not scale with the map (or
scales the wrong way), in River Valley, Any and the stages every theme shares. Measured on dev 4d111adb (generator
0.10.62), Normal, default settings, seeds 1–6 at 128², 1–12 at 256², 1–3 at 384²; each value the mean, Any / River
Valley. Constants in tiles on purpose (a beaver's walk, a district's reach, a footprint, the game's moisture spread,
the resources calibrated on the official maps by area) are not findings. Lines are dev's.

| # | Where | What it shapes | 128² → 256² → 384² (Any / RV) | Seen |
|---|---|---|---|---|
| 1 | `land/hydro.ts:1007, 1016` `apart.slice(0, 40)`, `far.slice(0, 40)` | The springs that bring water to the far land (D504) try only the 40 tiles farthest from the water: on a big map one clump, refused together for the one hollow on its way down. Any 256² s1's plan reached 12–14 % of the map within the soil's reach against its 50 % aim, then stopped. | land within 10 tiles of water 52/41 → 33/24 → 20/21 %; green 33/40 → 27/23 → 15/21 %; bare 64/58 → 70/74 → 81/76 %; water sources per 10k tiles 6.4/5.4 → 3.5/1.9 → 1.9/1.0 | Whole map: half of it brown. First hour: wood and farmland only along one river |
| 2 | `land/levels.ts:613–616` the grade's roll and rises at `rollCell × formScale`; `levels.ts:109` `RINGS.smooth × (f − 1)` | The rolling ground's swells keep their height in levels while their width grows with the map, and the levels are smoothed wider: half the slope at 256², a third at 384². | dead-flat land 44/47 → 54/61 → 67/69 % (the showcase target: under 50 %) | Whole map: plates of one level. First hour: building land everywhere, nothing to solve |
| 3 | `analysis/story.ts:60` `REACH = 0.14` of the side | The story's "near water" radius grows with the side (18 → 36 → 54 tiles) while the soil's moisture spreads about 10 tiles at every size, so the water story passes a barer map the bigger it is and never draws its land again for it. | dry land "near water" 70/60 → 68/60 → 57/68 % while within 10 tiles halves (row 1) | Not directly; it lets row 1 through |
| 4 | `analysis/story.ts:50` `STORY.mainShare 0.72` against `hydro.ts:1005` (rivers of their own, one per 128²) | The main system must hold 72 % of the water at every size while D504 adds a river of its own per 128², and a tributary to one counts as another. On dev it rarely shows only because row 1 stops them. | trial: Any 256² s1 with row 1 fixed: main share 60 %, 7 rivers apart → planned water refused 3 times | Not directly: a land refused |
| 5 | `land/intentions.ts:198` via `genome.ts:985` | The landmark's nudge raises the caprock's share by 0.1; D502 repeats it once for each 128² of the map, so a share of the whole map grows with its area. | caprock share 0.36/0.28 → 0.67/0.60 → 0.75 (the cap) | Whole map: more of the upper land stands as hard tablelands. Tried, worse (below) |
| 6 | `hydro.ts:687` River Valley `headCap` 5 from 256²; `hydro.ts:948` a spring's way down ≥ 0.35 × side; `hydro.ts:691` a tributary ≥ 0.18 × side | Fewer heads per tile as the map grows: the cap stays at 384², and the lengths asked grow with the side (90 and 46 tiles at 256², 134 and 69 at 384²). | RV water sources per 10k 5.4 → 1.9 → 1.0 | Whole map: one river and its few tributaries on a big plain |
| 7 | `gen/forms3d.ts:28` `formsWanted` (no W, H) | Caves, arches and overhangs are counted per map, 0–8 at every size. | set pieces per 10k tiles 1.42 → 0.68 (128² → 256²) | Whole map: the forms grow rarer by area; the start's overhang is the start's |
| 8 | `land/genome.ts:871` `terrace.cell` 20–50 tiles | Where benches stand (bench mask), at a 128²'s grain on every size; Any draws benches on 83–100 % of its maps without a plan. | grain fixed at 20–50 tiles (0.08–0.2 of a 256² side) | Whole map: stepped patches across the plain |
| 9 | `land/genome.ts:650` basin parts 12–32 tiles, counted by area | The lakes' hollows stay a 128²'s and multiply (on purpose, held to the water budget; D504 found more basins barer), and a trough part (`genome.ts:648`, kept in tiles since uplands round 1) floods as a straight-sided lake. | basins per Any map 3.5 → 7.5 → 13.3; lakes of 40+ tiles per 10k 1.73 → 0.57 → 0.32; Any 384² s1: an 87-tile trough holds a straight canal lake | Whole map: many dry hollows; at 384² a ruled lake |
| 10 | `gen/extras.ts:57–61` | Geothermal and relic counts stop growing at 192². | per 10k: a 384² map holds a quarter of a 192²'s | First hour: fewer finds to walk to |

Not findings (in tiles or counts on purpose): resources per tile (`gen/calibrated.ts`, the official maps by area:
bushes 110 → 48, ruins 166 → 55 per 10k from 128² to 256², above 256² extrapolated); the ring forms' 15–40-tile radius
from 256² (`rings.ts`, the game's knolls); the landmark's 25–60-tile view and its form's size; river widths (the
game's flow); walks, the start's clearing and the badwater distance; the washes' and notches' spacing.

## What was tried, and why nothing is built

Both trials were measured at 256² seeds 1–12, Any and River Valley, each run side by side with dev on the same
machine (CPU per map is the generating thread's).

**Row 1, the springs to the far land (`hydro.ts`, reach loop).** The trial tried 40 heads spread at least a tenth of
the side apart instead of the 40 farthest tiles, joined far springs only to the main system's courses, and held the
rivers of their own to the story's limits (`STORY.separate × storyScale`, others at most a fifth of the water). It
lives on branch `trial/big-map-reach` (no PR).

| 256² s1–12 | dev | trial |
|---|---|---|
| River Valley: bare / green | 0.741 / 0.228 | 0.599 / 0.376 |
| River Valley: CPU, the set | +0 % | +76 % (s1 31 → 91 s, attempts 1 → 3; s12's settle 15 → 51 s, rivers 4 → 11) |
| Any: bare / green | 0.701 / 0.270 | 0.706 / 0.265 |
| Any: CPU, the set | +0 % | +13 % (s1 attempts 2 → 5; s5 1 → 5, green 0.05) |

Without the story's limits the planned water failed the story 3 times on Any s1 (main share 0.60, 7 rivers apart),
which is row 4. River Valley's green is the look the brief asks for; its cost is the settle of every new river. That
is a design call: how much water a big map may plan for its CPU, or a cheaper settle for many rivers.

**Row 5, the caprock's share raised once per map (`genome.ts`, the backdrop loop; Lake Basin left as it is).**

| 256² s1–12 | dev | trial |
|---|---|---|
| caprock share, Any / River Valley | 0.67 / 0.60 | 0.42 / 0.31 |
| Any: bare / green, CPU | 0.701 / 0.270 | 0.726 / 0.244, +20 % |
| River Valley: bare / green, CPU | 0.741 / 0.228 | 0.724 / 0.246, +11 % |
| start's room under 400 (Any) | s1, s7, s10, s11 | s1, s5, s6, s7, s8, s11 |

It moves every map above 128² (the genome's draws after it change), and the maps came out no greener: the caprock is
not what makes the big plate bare. Reverted. Whether three quarters of the upper land should stand as hard tableland
at 384² remains a question for the uplands' owner.

**Already short on dev, out of scope.** The start's room is under 400 on Any 256² s1 (190), s7, s10 and s11; the
start's choice is the start stage's. Lake Basin draws the same per-form caprock raise (row 5). Any 384² s1's straight
canal lake (row 9) is a trough part kept in tiles since uplands round 1.
