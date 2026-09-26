# Investigations

The studies behind the plans (PLAN.md, ROADMAP.md): each folder holds a report, its measurements
and often prototype code. This page lists every one, what became of it, and where its adopted
pieces live now.

## Not for import by product code

Nothing under `src/` imports from `investigation/`; `tests/unit/boundaries.test.ts` fails if
anything does. The prototype code here (claude, cycles, generative, landscapes, simspeed,
techniques, terrain3d, workshop, the audit's repros, and the Python scripts) runs on its own and
may lag the product. A piece that is adopted is ported or moved into `src/` or `tools/`, with a
comment naming its source. Tools and tests may still read data files here at run time:
`notes/footprints.json`, and the local-only `raw/` maps.

## What an investigation commits

Kyler's rule (PLAN.md §20, D195):
- **Commit** the report, the code, small samples and a few captures.
- **Keep out of git** large generated results: bulk JSON, thousands of files, anything over a few MB.
  Put them in `investigation/<name>/local/` (gitignored) or attach them to a GitHub Release.
- **Say how to regenerate them** in the report: the command, its inputs and roughly how long it takes.
- What's already merged stays as it is; history is not rewritten.

Paste this into every investigation prompt, for Claude or Codex:

> Repository size rule (Dam Good Maps, D195): commit your report, code, small samples and a few
> captures. Keep large generated results (bulk JSON, thousands of files, anything over a few MB) out
> of git: write them to `investigation/<your-folder>/local/` (gitignored) or attach them to a GitHub
> Release, and say in your report exactly how to regenerate them.

## Status

- **Adopted**: built into the product.
- **Partly adopted**: some of it is built; the rest waits for a later milestone.
- **In progress**: taken into the plan, or proposed for it, for a step not built yet. Nothing is in
  the product yet.
- **Archived**: finished, kept for reference.
- **Open PR**: not merged into dev yet.

## Index

| Investigation | What it is | Status | PR | In the product |
| --- | --- | --- | --- | --- |
| [REPORT.md](REPORT.md), [notes/](notes/), [calibration.json](calibration.json), `analyze_maps.py` | The first investigation (2026-09-23): what the game's code, blueprints and maps say about valid, playable maps, and the official maps measured. | Adopted | None (commit bcb04bd) | FORMAT.md and PLAN.md rest on it. Water and soil rules: `src/core/sim/` (water, model, moisture, prefill, contamination). Load rules: `src/core/validate/checks.ts`, `src/core/format/` (normalize, entities, footprints). Footprints: `tools/export-footprints.ts` writes `src/core/data/footprints.json`. Measures: `src/core/analysis/metrics.ts` (from `analyze_maps.py`). Targets: `src/core/gen/calibrated.ts`, `src/ui/settingsModel.ts` (from `calibration.json`). |
| `decompile_all.sh`, `extract_builtin_maps.py`, `summarize_blueprints.py`, `figures/` | The first investigation's collecting tools: they decompile the game into `decompiled/`, copy its built-in maps into `raw/builtin/` and summarize its blueprints; and one early render. | Archived | None (commit bcb04bd) | None. The local-only readers of `raw/builtin` (`tools/oracle.ts`, the import and maps tests) use what they copied. |
| [workshop/](workshop/), [WORKSHOP.md](WORKSHOP.md), [WORKSHOP-INTEGRATION.md](WORKSHOP-INTEGRATION.md), `workshop.json` | 130 workshop maps and the 19 official ones measured against the generator: variety, rivers, reservoirs, naturalness, settings bands. | Partly adopted (D87; the ratings dropped, D137) | [#4](https://github.com/timbermods/dam-good-maps/pull/4) | `src/core/analysis/walk.ts` (its walk distance), `src/core/analysis/mechanics.ts` (approximate water on imports, D98), `withObjectsOnNewGround` in `src/core/doc/tools.ts` (D102), the start thresholds in `src/core/validate/playability.ts` (D85). The score, variety, naturalness and recipes wait for M9. |
| [claude/](claude/) | Groundwork for M12: 120 player requests, a place resolver, judgement words, seven tools, a harness and a self-played pilot. | In progress (D88–D96, D134) | [#5](https://github.com/timbermods/dam-good-maps/pull/5) | None yet. M9 moves `lib/view.ts`, `lib/flow.ts`, `lib/places.ts` and `lib/words.ts` into `src/core/`; M12 moves the rest. |
| [audit/](audit/) | A first-pass audit of beta risks: four findings (A1–A4), each with a repro. | In progress: A1 and A2 in M9a, A3 and A4 on the Refinement list (D129) | [#13](https://github.com/timbermods/dam-good-maps/pull/13) | None yet. |
| [cycles/](cycles/) | A weather-cycle simulator and viewer: how a generated map behaves through droughts and badtides, with the game's timings. | In progress: an M9 design input, and the Weather view (D133) | [#10](https://github.com/timbermods/dam-good-maps/pull/10), [#15](https://github.com/timbermods/dam-good-maps/pull/15) | None yet. The product's drought is the analytic one (`src/core/sim/drought.ts`). |
| [generative/](generative/) | M9 design versions 1 and 2: a prototype generator that invents maps (genome, uplift, erosion, drainage; version 2 in `v2/` adds relief, Verticality, intentions and Kyler's start and edge rules), its measures ([REPORT-v2.md](generative/REPORT-v2.md)), and ten briefs a version with their maps. | In progress: version 2 approved (D209); M9a builds it | [#14](https://github.com/timbermods/dam-good-maps/pull/14), [#32](https://github.com/timbermods/dam-good-maps/pull/32) (open) | None yet. |
| [landscapes/](landscapes/) | 4,050 real terrain patches turned into game heightmaps and measured, and a library of 88 validated maps. | Partly adopted: the library is Real places (D136); the rest is an M9 design input | [#16](https://github.com/timbermods/dam-good-maps/pull/16) | Real places: `tools/real-places.ts` turns the library's 85 named places (not the three random-land controls) into `public/real-places/`, which `src/core/places/` builds and `src/places/` shows. |
| [simspeed/](simspeed/) | Exact speedups for the water simulation, M9's pipeline budgets, and water in stacked layers. | In progress: proposals for M9a's build plan (D130) | [#17](https://github.com/timbermods/dam-good-maps/pull/17) | None yet. |
| [techniques/](techniques/) | A cited terrain-technique playbook and two experiments on the M9 prototype. | In progress: proposals for M9 and the 3D stages (D131) | [#19](https://github.com/timbermods/dam-good-maps/pull/19) | None yet. |
| [terrain3d/](terrain3d/) | Real 3D terrain (caves, overhangs, tunnels, arches): the game's rules, prototypes and a staged design. | In progress: adopted as D118–D127, built in the 3D stages 3D-a to 3D-c | [#20](https://github.com/timbermods/dam-good-maps/pull/20) | None yet. |
| [mechanics/](mechanics/) | The game's map mechanics, verified against its code, and each map's place on eight strategy axes. | In progress: an input to the M9 design and the Weather view (D133) | [#11](https://github.com/timbermods/dam-good-maps/pull/11) (replaces [#9](https://github.com/timbermods/dam-good-maps/pull/9)) | None yet. An input to the M9 design and the Weather view (D133). |
| [names/](names/) | Map names and descriptions drawn from each map's features. | In progress: for M9c's names and descriptions | [#12](https://github.com/timbermods/dam-good-maps/pull/12) | None yet. |
| [probe/](probe/) | DGM Probe: a mod and a runner that play maps in the game unattended and record what happens. | Adopted as a tool (D149): M9a's in-game gate (D116); batches only under the probe rule (D117, D218) | [#18](https://github.com/timbermods/dam-good-maps/pull/18) | It runs from here; `tools/probe-tall.ts` makes the tall maps. |
| [simspeed-cycles/](simspeed-cycles/) | Exact-weather speedups and scheduling for the weather cycle. | In progress: proposals for the Weather view (D173) | [#33](https://github.com/timbermods/dam-good-maps/pull/33) | None yet. |
| [pickplace/](pickplace/), [pickplace-water2/](pickplace-water2/) | Pick a place: real land with designed water, then its signature water with ESA WorldCover. | In progress: proposals for Pick a place (D166, D192) | [#34](https://github.com/timbermods/dam-good-maps/pull/34), [#45](https://github.com/timbermods/dam-good-maps/pull/45) | None yet. |
| [maplook2/](maplook2/) | Map look 2: a High look with a water shader and soft shadows, and the calibrated badwater colours. | Partly adopted: its badwater colours are in the shared water palette (D177); the rest is for Map look 2 (D147) | [#38](https://github.com/timbermods/dam-good-maps/pull/38) | `src/render3d/waterPalette.ts` (the badwater colours). |
| [carve/](carve/) | Carve, a force of nature: water cutting its own gorge or valley, with varied bends and oxbow lakes. | Adopted (D194, D199, D216) | [#47](https://github.com/timbermods/dam-good-maps/pull/47) | `src/core/forces/carve/` and the Carve button (preview only until Kyler tries the forces, D219); `tools/carve-equiv.ts` proves the port. |
| [craterize/](craterize/), [erupt/](erupt/), [quake/](quake/) | Craterize (a giant impact), Erupt (a volcano) and Quake (a fault: Lift or Slide): three more forces. | In progress: ready (D216, D219), built into Live editing's forces group next | [#51](https://github.com/timbermods/dam-good-maps/pull/51), [#50](https://github.com/timbermods/dam-good-maps/pull/50), [#52](https://github.com/timbermods/dam-good-maps/pull/52) | None yet. |
| [forces-core/](forces-core/) | One shared core for the four forces: a literal result operation, one history entry, the editor's worker and water, and a demo with all four. | In progress: proposals for the forces (D220) | [#59](https://github.com/timbermods/dam-good-maps/pull/59) | None yet. |
| [juice/](juice/) | Procedurally synthesised editor sounds: one small engine, no samples. | In progress: proposals for Live editing's juice (D205, D220) | [#58](https://github.com/timbermods/dam-good-maps/pull/58) | None yet. |

`raw/` and `decompiled/` stay local (gitignored): copies of the game's files, official and
workshop maps and saves, which are not ours to redistribute, and decompiled game code, for
answering questions only.

## Running a prototype

Each folder's README or REPORT says how. Some have their own `package.json` (audit, cycles,
landscapes, simspeed, claude/harness), installed in that folder, for example
`npm ci --prefix investigation/cycles`. The rest use the root's packages and run from the root,
for example `npx tsx investigation/generative/batch.ts`.
