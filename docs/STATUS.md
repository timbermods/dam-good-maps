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
  hands out decision numbers (next free: D471). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high; `C:UserskramscodeDamGoodMaps-page`, `feature/page`, PR #163) builds "The page is
  the editor". The generator is built as Kyler's A (the sheet), with Layout 2 and the settings on `/preview/`; #163 is a
  ready PR labelled `approved`, and the milestone session reviews it before it merges.
- **The renderer session** (Kyler's PC; its own branches) builds the High look's and the renderer's fixes; its PRs merge on
  green CI (D453).
- **Codex** builds investigations on `investigation/<name>`; the milestone session adopts them.
- **Other Claude Code sessions Kyler starts:** the theme critique, the Canyon and Highlands round, the Islands rounds.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`). Merge order is the queue below. States are
as of 2026-10-04 and move.

| Work | Branch | PR | State |
|---|---|---|---|
| The page | `feature/page` | #163 | Ready, labelled `approved` (Kyler to confirm); 5 CI checks failing; review and merge once green |
| Badwater line, wave check, wider names | `fix/badwater-line-names` | #265 | `needs-kyler`; first of the generator queue (generator 0.8.1, one re-pin); waits on its session's fixes (the 0.8.0 carves project, version files, docs) and Kyler's look |
| Canyon and Highlands height | `investigation/canyon-highlands-height` | #261 | Back for another round (Canyon 27's gorge, Highlands 2 and 23 bare, a camera-pitch sheet); generator 0.9.0, renumbers if it merges second |
| Parity core (D337–D339) | `feature/parity-core` | #269 | `approved` (#270: all four game-fidelity changes, the seep cap with its seep_pit re-pin); merging |
| Rift and Deposit in Rust | `feature/rift-deposit` | none yet | Being adopted from #268's patch; the page adds the controls after |
| Three core fixes | `fix/core-findings` | none yet | In progress: no force adds a source, no empty edit step, frozen mode keeps its slopes |
| Basin highlight | `fix/basin-highlight` | #225 | Fails the palette test (a hard-coded colour); the renderer session fixes it |
| Islands round 4 | `investigation/islands-round-3` | #235 | `needs-kyler`; a product change, re-pinned (D148); Kyler judges the sheets |
| Roadmap canvas on a phone | `tools/roadmap-canvas-mobile` | #259 | `approved` |
| Theme critique | `investigation/theme-critique` | #211 | The report; its badwater PR is #265 |
| Islands round 2 | `investigation/islands-round-2` | #210 | The work continues in #235 |
| Performance audit | `investigation/perf-audit` | #152 | Approved; guides the speed work |
| Scaling | `investigation/scaling` | #132 | Draft; round 4 approved for adoption |
| Parallel water | `investigation/parallel-water` | #130 | Draft; approved; the multi-core path |
| Parity with the game's editor | `feature/parity` | #95 | Draft; superseded by #269 |
| Drought and Badtide, day by day | `feature/weather-days` | #73 | Draft; parked for Kyler's sitting, after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 | Draft; parked as the reference; its stacked engine is in `rust/water` (#260, D448) |
| Real places, round 2 | `feature/real-places-2` | #35 | Parked by Kyler (D319); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 | Draft; redundant (`sourceGroups.ts` is on `dev`); to close |

## Queued

1. The Rust order: the water (#212) and the forces (#254) are merged (`ts-water-final`, `ts-forces-final` tagged), and so is
   the stacked water crate (#260, no wiring yet). Next: Rift and Deposit (#268, being adopted on `feature/rift-deposit`), then
   parity core's adoption (#269, waiting on Kyler, #270). The forces crate keeps its own copy of the water kernel, to be shared.
2. The generator queue, one re-pin at a time: the badwater line (#265), then Delta arms round 2 (#233), Lake Basin round 3
   (#234) and River Valley round 2 (#244), the last three merged as investigations and waiting to be adopted. Canyon and
   Highlands height (#261) is back for another round; Islands round 4 (#235) waits on Kyler's eye (needs-kyler).
3. The page (#163), then the area brush's toggle (the brush, #227, is merged) and the page's startup half: a project
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
