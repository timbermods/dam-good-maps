# MCP usability trial (2026-11-14)

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

## What the PR on `feature/mcp-trial` mends

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
