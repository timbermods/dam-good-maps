# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on the Coordination issue
([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0, deployed, live check passed). After it, two releases that
changed `main` only: `roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex, live) and `needs-kyler-ping-done` (the
label pings Kyler's phone). Before them, 2026-10-01: `forces-done` (D375), `map-look-2-done` (D378) and `licence-agpl-done`
(D379). Every released step's tag: `git tag -l '*-done'`. `dev` is ahead of `main` by what merged after the release.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high; the dedicated machine) does everything except the page, merges, releases and
  hands out decision numbers (next free: D474). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high; `C:UserskramscodeDamGoodMaps-page`, `feature/page`, PR #163) builds "The page is
  the editor", then adds Rift and Deposit's controls and Carve's Maturity setting. The generator is built as Kyler's A (the sheet), with Layout 2 and the settings on `/preview/`; #163 is a
  ready PR labelled `approved`, and the milestone session reviews it before it merges.
- **The renderer session** (Kyler's PC; its own branches) builds the High look's and the renderer's fixes; its PRs merge on
  green CI (D453).
- **Codex** (Kyler's PC) builds investigations on `investigation/<name>`; the milestone session adopts them. Four new ones
  are running, each with an adoption patch and no PR yet (rows below).
- **Other Claude Code sessions Kyler starts:** the theme critique, the Islands rounds, and a new Canyon session (Opus 5.5,
  #261) for one Canyon-only round; Highlands is approved.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`). Merge order is the queue below. States are
as of 2026-10-04 and move.

| Work | Branch | PR | State |
|---|---|---|---|
| The page | `feature/page` | #163 | Ready, labelled `approved` (Kyler to confirm); 5 CI checks failing; review and merge once green; then Rift and Deposit's controls and Carve's Maturity setting |
| Badwater line, wave check, wider names | `fix/badwater-line-names` | #265 | `needs-kyler`; first of the generator queue (generator 0.8.1, one re-pin); waits on its session's fixes (the 0.8.0 carves project, version files, docs) and Kyler's look |
| Canyon and Highlands height | `investigation/canyon-highlands-height` | #261 | `needs-kyler`; Highlands approved; a new Canyon session (Opus 5.5) does one Canyon-only round (seed 27's gorge, the round's start lakes); generator 0.9.0, renumbers if it merges second |
| Every setting makes a map (D471) | `fix/every-setting-makes-a-map` | #277 | Open, with a byte fix; the milestone session's current item. Next: the three open every-setting combinations and the extreme seed's speed (it took 37 attempts) |
| Forces end when their land is final | `fix/force-feedback` | #275 | `approved`; renderer session: two `forcesSitting` failures left to fix |
| Basin highlight | `fix/basin-highlight` | #225 | Fails the palette test (a hard-coded colour); the renderer session fixes it |
| Multi-core water | `feature/multicore-water` | #281 | Merged (38d4ee6b): #130's strips on the Rust water, byte-identical; the service worker's isolation (D397, caching still to come); /preview/ shows it once the page session merges it into `feature/page` |
| Multi-core water, follow-ups | `fix/multicore-water-followups` | none yet | In flight, not yet on GitHub |
| Core parity (D337–D339) | `feature/parity-core` | #269 | Merged; all four game-fidelity changes approved (#270) |
| Rift and Deposit in Rust, the core half | `feature/rift-deposit` | #273 | Merged; the page adds the controls and effects |
| Carve's Maturity | `fix/remove-maturity` | #293 | Removed (Kyler, 2026-10-04, D473): Carve is the Young carve again; saved Mature carves open as recorded; the page removes the control |
| Three core fixes | `fix/core-findings` | #274 | Merged: no force adds a source, no empty edit step, frozen mode keeps its slopes |
| The second core hunt | `investigation/core-hunt-2` | #280 | Merged: three fixes; Deposit's pillars with Codex (#285, back for a round) |
| Water speed | `feature/water-speed` | #290 | Merged: the flow layout and the skipped wet-list rebuild, byte-identical; no SIMD |
| Generation speed | `investigation/gen-speed-2` | #291 | Closed, not adopted (Kyler, 2026-10-04: 7% on one case, no overall gain, built on old dev); no more rounds: generation gets faster with the generator's Rust port after the theme queue |
| Forces speed, half A | `feature/forces-speed` | #289 | Merged: invariant hoists and playback reuse, TypeScript only, every forces pin unchanged; half B left out |
| Deposit's pillars | `investigation/deposit-pillars` | #285 | Back to Codex for one round (it refuses every short draw; some fans shrank); adopted when its next push is approved |
| Dam sketch round 3 | `investigation/dam-sketch-3` | #279 | Parked until its adoption after the Weather view; the engine on the Rust water (446c641a). Two doubts to settle then: "two stacked dams" holds exactly what one dam holds (18.207 m³, the same dry-out day), and every wall change restarts the worker instead of cancelling inside it. Its `rust/water` patch needs reconciling with multi-core and water speed |
| Islands round 6 | `investigation/islands-round-3` | #235 | `approved`; adopted in the generator queue's order, re-pinned; no more Islands rounds |
| Roadmap canvas on a phone | `tools/roadmap-canvas-mobile` | #259 | `approved` |
| Theme critique | `investigation/theme-critique` | #211 | The report; its badwater PR is #265 |
| Islands round 2 | `investigation/islands-round-2` | #210 | The work continues in #235 |
| Performance audit | `investigation/perf-audit` | #152 | Approved; guides the speed work |
| Scaling | `investigation/scaling` | #132 | Draft; round 4 approved for adoption |
| Parallel water | `investigation/parallel-water` | #130 | Approved; built by #281 |
| Parity with the game's editor | `feature/parity` | #95 | Draft; superseded by #269 |
| Drought and Badtide, day by day | `feature/weather-days` | #73 | Draft; parked for Kyler's sitting, after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 | Draft; parked as the reference; its stacked engine is in `rust/water` (#260, D448) |
| Real places, round 2 | `feature/real-places-2` | #35 | Parked by Kyler (D319); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 | Draft; redundant (`sourceGroups.ts` is on `dev`); to close |

## Queued

1. The Rust order: the water (#212) and the forces (#254) are merged (`ts-water-final`, `ts-forces-final` tagged), and so
   are the stacked water crate (#260, no wiring yet), Rift and Deposit (#273), Carve's Maturity (#278), parity core (#269) and
   multi-core water (#281). Next: #277, then the three open every-setting combinations and the extreme seed's speed. Then
   Codex's speed adoptions (water, generation, forces), and the dam sketch's (#279) after the Weather view, reconciled with
   multi-core and water speed. The forces crate keeps its own copy of the water kernel, to be shared.
2. The generator queue, one re-pin at a time: the badwater line (#265), then Delta arms round 2 (#233), Lake Basin round 3
   (#234) and River Valley round 2 (#244), the last three merged as investigations and waiting to be adopted. Canyon and
   Highlands height (#261) is back for another round; Islands round 4 (#235) is held for Kyler.
3. The page (#163), then Rift and Deposit's controls, Carve's Maturity setting, the area brush's toggle (the brush, #227, is merged) and the page's startup half: a project
   autosaved while its water is pending carries no stored map, so the page should autosave again once the water settles
   (the "settled" event; D367, D455).
4. The CI merge queue: the workflow side is merged (#238); the ruleset is Kyler's to create (none exists yet).
5. After the release: the Dependabot majors (D460), "Designed for" removed (D449), byte-exact reopening's (a) (D455).

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen). The defaults still open are in
[decisions-pending.md](decisions-pending.md).

## The release gate (D385–D387)

Passed: M9b released as `m9b-done` (2026-10-04, [#217](https://github.com/timbermods/dam-good-maps/pull/217)). The coherence
cleanup (D462, D463) is finished: groups 1–10 are merged, group 2 trimmed by Kyler's call on #243. Islands' known shortfall
(12 of 30 seeds at 128² with no island to expand to) is fixed by a round after the release.

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
