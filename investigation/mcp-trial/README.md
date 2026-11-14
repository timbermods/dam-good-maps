# MCP usability trials (2026-11-14)

## Run 1 (against dev 6eb8661bd)

A fresh agent used the Dam Good Maps MCP server through a stdio client (`client.mjs`). It read only `initialize` and
`tools/list`, never the source. It fulfilled three player asks on 96-tile maps.

| Ask | Outcome |
| --- | --- |
| 1. A canyon map with two waterfalls side by side | Fulfilled, in 5 generate calls where 2 would do: the first call left out the intention, and 3 seeds did not give the twin falls. |
| 2. Carve a river from the north-east down to the lake; an eruption where the badwater is | Fulfilled. The eruption cleared the badwater source it stood on; the agent undid it. |
| 3. Move the start next to the river, add a crater lake, save | Partly. The default crater changed 4,015 tiles and moved the start; the agent undid it, made a size-16 crater and placed a water source in it. The saved map warns "No clean water within 64 tiles' walk of the start". |

Files: `findings.md` (the agent's report, ranked by cost), `transcript.jsonl` (every request and response; the eight
PNG pictures are replaced by a note of their length, to keep the file small), `client.mjs`. The saved maps stay out
of git.

## What the first round on `feature/mcp-trial` mends

Words and schema shaping in `mcp/` only; no engine change.

1. Craterize's size: the apply schema states each force's defaults and the unit (tiles across), and that a craterize
   at its default power is 54 tiles across. The result notes when a force moved the start.
2. A crater makes no water: apply says only Carve and Glaciate make water, and a craterize's result says how to make
   a crater lake.
3. Intentions: generate has an example call and says what to do when an intention did not emerge; the result marks
   the intentions asked for and gives the next step when one did not emerge.
4. describe gives each lake its basin tiles, wet tiles, area and outlet, and lists the rivers Carve cut.
5. check gives a one-line verdict, and says that a walk is on foot without building.
6. Directions: the instructions, apply and describe say X runs west to east and Y south to north; `where` says what
   origin and end mean for each force.
7. apply says a force clears the sources on its ground unless `sources` is `ride`; the result names the sources
   cleared.
8. save says the files are named `dgm-` and the name; `name` says it stays the map's name. The stored fields of a
   force show only "The engine fills this. Leave it out."

Left for later: craterize's default size and a `lake` setting, the picture marking falls and lakes (9), and what
`waterfalls: few/many` means in numbers.

## Why the start had no clean water

The agent moved the start to X 82 · Y 70, level 11. The check is right by its rule. The start's walk (on foot,
without building) is the 81 tiles of level 11 round it, which one-level steps bound on every side (beavers
climb or drop a level only by a slope or stairs). The river is at level 7, four tiles away and four levels down. So no shore a pump
draws from is in the walk. The carved river is fed (3 sources) and clean. The fault is the words: "within 64 tiles'
walk" reads as a distance, and nothing said that the walk ends at a step. The move itself was allowed; nothing warned
that the new place cuts the start off from its water.

## Run 2 (against f0a0f1a01, the first round's words)

Another fresh agent, the same three asks and the same rule (no source). Files: `run-2/findings.md`, `run-2/transcript.jsonl`
(26 PNG pictures replaced by a note of their length).

| Ask | Calls (least needed) | Outcome |
| --- | --- | --- |
| 1. Two waterfalls side by side | 23 (3) | Partly: twin-falls did not emerge in 19 generates (Canyon, River Valley, Highlands, Any; 96 and 128; seeds 1 to 22). The agent told the player so. |
| 2. Carve to the lake; erupt on the badwater | 5 (4) | Fulfilled. The notes (start moved, sources cleared, "ride") and the check's verdict worked. |
| 3. Move the start by the river; crater lake; save | about 15 (about 6) | Fulfilled. Older handles had closed without a word, save's default folder was missing, and the start's id was found only by luck. |

### How often twin-falls emerges

Counted through the server's own generate (2026-11-14, dev engine 0.10.22), 96-tile maps unless named:

| Theme | Seeds | Emerged |
| --- | --- | --- |
| Canyon | 1–30 | 1 (seed 12), with and without `waterfalls: many`: the setting changed no result |
| Canyon, 128 | 1–10 | 0 |
| River Valley | 1–15 | 0 |
| Highlands | 1–15 | 4 (seeds 4, 11, 12, 15) |

Run 1's seed 12 still gives the twin falls with the same input: no regression. On Canyon seed 11 (and two Highlands
seeds) the generator set the asked intention aside to make a map, and the result did not say so. The words now give
these rates, an example that works (Highlands, small, seed 4; a test pins it), and "after about five misses, tell the
player it did not come out". Two carves over one cliff do not reliably make twin falls (tried on Canyon seed 1: they
ran into badwater), so the words do not offer that. For planning: twin-falls is close to unreachable outside
Highlands, and `waterfalls: many` has no effect on it.

### What the second round mends

- Open maps: the limit (6) is in the instructions and generate; the refusal says to open the saved project or
  generate again with the same input and seed. Edits stay in the server until save; open reads only the saved file.
- save: the default folder is refused when Timberborn's folder is missing (then give `folder`). A generated map that
  keeps its own name saves as `dgm-<theme>-<seed>`; another name names the files. Run 2 gave the generated name
  "Hollow Gorge", so its files kept the seed: the rule, not a fault.
- Craterize `size`: the ground changes out to about `size` tiles from the middle (about twice `size` across; measured
  on 160-tile maps at sizes 8, 16, 32 and the default), and a shallow form shows best in the heights layer.
- apply: where the start's id comes from; `picture: true` pictures where the water changed when no ground did, and
  says why when neither did.
- check: each list in a row's `where` (bush ids, tiles) is cut to its first 8, with its total.

Left for later (core): a refused start move naming the nearest free tile; a start move onto trees felling them in one
place and refused in another.
