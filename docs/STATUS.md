# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on the Coordination issue
([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0, deployed, live check passed). Before it, 2026-10-01:
`forces-done` (D375), `map-look-2-done` (D378) and `licence-agpl-done` (D379). Every released step's tag:
`git tag -l '*-done'`. `dev` is ahead of `main` by what merged after the release.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high; the dedicated machine) does everything except the page, merges, releases and
  hands out decision numbers (next free: D471). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high; `C:\Users\krams\code\DamGoodMaps-page`, `feature/page`, PR #163) builds "The page is
  the editor". The settings panel (option B) is built; it waits on Kyler's pick between two generator mockups.
- **The renderer session** (Kyler's PC; its own branches) builds the High look's and the renderer's fixes; its PRs merge on
  green CI (D453).
- **Codex** builds investigations on `investigation/<name>`; the milestone session adopts them.
- **Other Claude Code sessions Kyler starts:** the theme critique, the Islands rounds, the coherence cleanup.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`). Merge order is the queue below. CI states
are as of 2026-10-04 and move.

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| Coherence cleanup 1, dead code | `cleanup/1-dead-code` | #213 | none | CI green; merges first |
| Coherence cleanup 2, one flood | `cleanup/2-one-flood` | #214 | none | Trimmed to its no-bytes commit (Kyler's call, #243); merges after 1 |
| Coherence cleanup 3 to 7 | `cleanup/3-forces-core` to `cleanup/7-planners` | #221, #223, #226, #230, #241 | none | In order after 2; #230 still needs its investigation-import fix |
| Rust water switch | `feature/rust-water-switch` | #212 | `-rust` | Next after the cleanup's group 5 or ahead of it, whichever merges first; the other rebases |
| The Rust forces adopted (#158, D381) | `feature/rust-forces` | its own | `-rforces` | Planners in Rust, the TypeScript computation tag `ts-forces-final` and deleted; after #212 |
| Startup part 1, the core half | `feature/startup-part1` | #222 | none | CI running; D367, D455 |
| CI merge queue | `ci/merge-queue` | #238 | none | CI running |
| Badwater joins rivers and lakes | `fix/badwater-contained-d469` | #245 | none | First of the generator queue (D469); one re-pin |
| Lake Basin round 3 | `investigation/lake-basin-variety` | #234 | none | Kyler said yes; merges as an investigation, patch adopted third |
| Islands round 4 | `investigation/islands-round-3` | #235 | none | On hold; CI red; Kyler judges the sheets and the 256² trade |
| The page | `feature/page` | #163 draft | `-page` | Page session; waits on Kyler's generator pick |
| Area brush | `feature/area-brush` | #227 | none | CI green; the page adds its toggle after it merges |
| Renderer fixes | `fix/frame-fit`, `fix/basin-highlight`, `fix/high-worker` | #219, #225, #240 | none | #225 fails the palette test (a hard-coded colour); the renderer session fixes it |
| Parity with the game's editor | `feature/parity` | #95 draft | `-parity` | Parked: Codex rebuilds its core in Rust first |
| Drought and Badtide, day by day | `feature/weather-days` | #73 draft | `-weather` | Parked: held for Kyler's sitting, after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 draft | `-3d` | Parked as the reference: Codex ports its stacked engine into the Rust water (D448) |
| Real places, round 2 | `feature/real-places-2` | #35 | `-places` | Parked by Kyler (D319); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 draft | `-groups` | Redundant: `sourceGroups.ts` is on `dev`; to close |

| PR | Investigation | State |
|---|---|---|
| #158 | rust-forces | Adopted on `feature/rust-forces` (planners in Rust; the TypeScript computation tag `ts-forces-final`, deleted) |
| #244 | river-valley-sheets | Waits on Kyler (`needs-kyler`) |
| #211 | theme-critique | CI red; its badwater PR is #245 |
| #210 | islands-round-2 | Islands round 2; the work continues in #235 |
| #152 | perf-audit | Approved; guides the speed work |
| #132 | scaling | Draft; round 4 approved for adoption |
| #130 | parallel-water | Draft; approved; the multi-core path |
| #190 | roadmap-canvas | Waits on Kyler (`needs-kyler`) |

## Queued

1. The documents: #246 (this one); #237 and #239 are merged.
2. The coherence cleanup: groups 1–5 are merged (#213, #214 trimmed to (b), #221, #223, #226); #230 (group 6) waits for its
   investigation-import fix, then #241 (group 7) after its rebase onto the new group 6.
3. The Rust water switch (#212, resolving a conflict with dev), then the Rust forces (#158, being adopted on
   `feature/rust-forces`).
4. The generator queue, one re-pin at a time: the theme critique's badwater-line PR (D469; not opened yet), then Delta arms
   round 2 (#233, merged as an investigation), then Lake Basin round 3 (#234, merged as an investigation); Islands round 4
   (#235) after Kyler's judgement. #245 (D57 amended by D469) is merged.
5. Startup part 1 (#222) is merged: a project autosaved while its water is still pending carries no stored map, so the page
   should autosave again once the water settles (the "settled" event). The rest of D367; "The page is the editor" (#163);
   the CI merge queue (#238 merged; the ruleset waits for Kyler).
6. After the release: the Dependabot majors (D460), "Designed for" removed (D449), byte-exact reopening's (a) with startup
   part 1 (D455).

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen). The defaults still open are in
[decisions-pending.md](decisions-pending.md).

## The release gate (D385–D387)

Passed: M9b released as `m9b-done` (2026-10-04, [#217](https://github.com/timbermods/dam-good-maps/pull/217)). The coherence cleanup
keeps merging into `dev` in order (D462, D463); Islands' known shortfall (12 of 30 seeds at 128² with no island to
expand to) is fixed by a round after the release.

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
