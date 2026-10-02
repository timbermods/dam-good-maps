# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [PLAN.md §20](../PLAN.md#20-editor-decisions); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest, all 2026-10-01 and live: `forces-done` (D375), `map-look-2-done` (D378, the High look) and `licence-agpl-done`
(D379, `main` at 87c73a0, generator 0.7.0). Every released step's tag: `git tag -l '*-done'`.

## The two sessions (D388)

- **The milestone session** (Opus 5.5, high; the main clone) does everything except the page: the core, the water, the
  generator, the editor-core items, the Codex adoptions and the documents. It owns PLAN §20's numbering, STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; its own worktree `-page` and branch `feature/page`) does only "The page is the
  editor" and its design (D384). It starts fresh from `dev` (D395), once the milestone session has prepared the folder and
  pinged Kyler with its path; Kyler starts it. It owns the page, the editor's interface, Editor.tsx and its split,
  and records its decisions in its own `DESIGN.md` and `docs/progress/page.md`; the milestone session folds them into PLAN
  when its work merges. Neither session touches the other's files; a control the core's items need (Remove unfed water,
  Fill) is agreed with the page session through Kyler.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`).

| Work | Branch | PR | Worktree | Session | State |
|---|---|---|---|---|---|
| The document prune (D390) | `chore/prune-*` | none | `-prune-*` | milestone, Sonnet 5.5 sub-agents | All steps merged into `dev`; the prune branches and worktrees can be removed |
| The page's headless core, salvaged from part 1 (D395) | `feature/page-core` | #161 | none | milestone | Merged into `dev` (66d8a779) |
| The editor-core items (D387) | none yet | none | main clone | milestone | Next, alongside the page |
| M9b | `feature/m9b` | #70 draft | `-m9b` | milestone (`m9b-build`) | Islands, Delta and River Valley adopted; merge `dev` in first, then the adoption order in ROADMAP ("M9b"); held for Kyler's eye (D252, D273); log: `docs/progress/m9b.md` |
| The page, "The page is the editor" with the design pass | `feature/page` (from `dev` at the salvaged core) | none yet | `-page` | page | Worktree ready; Kyler starts the session |
| The page, part 1 | `feature/page-editor-1` | #92 | none | none | Superseded (D395): #92 closed; the branch is kept as a record until the new page ships |
| Parity with the game's editor | `feature/parity` | #95 draft | `-parity` | milestone | D337–D339; follows M9b |
| Drought and Badtide, day by day | `feature/weather-days` | #73 draft | `-weather` | milestone | Held for Kyler's sitting; after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 draft | `-3d` | milestone | New modules verified against the game; wiring waits for `dev` (D280) |
| Real places, round 2 | `feature/real-places-2` | #35 | `-places` | milestone | Parked by Kyler (D319); 37 of 136 converted (VERSION 11); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 draft | `-groups` | milestone | Its `sourceGroups.ts` is already identical on `dev`; redundant |

Codex's investigations (each on `investigation/<name>`; Codex builds, the milestone session merges them at a boundary and
adopts; Kyler's verdicts are in ROADMAP, "The Codex adoptions"):

| PR | Investigation | State |
|---|---|---|
| #159 | dam-sketch (D383's engine) | Merged as an investigation, not adopted (D392); its adoption gates are in ROADMAP, "The dam sketch tool" |
| #158 | rust-forces | Draft; still round 1 (not adoptable); round 2 in flight, nothing to do until it lands |
| #157 | rust-analysis | Merged through #160, approved; adopted after M9b's release (D391) |
| #156 | rust-water | Draft; approved (D381) |
| #155 | gen-speed | Approved; adopt round 1, then round 2, on M9b |
| #153 | small-starts | Approved; adopt first on M9b |
| #152 | perf-audit | Approved; its roadmap guides the speed work |
| #150 | short-codes | Approved; findings into COLLAB-BRIEF |
| #132 | scaling | Draft; round 4 approved for adoption |
| #130 | parallel-water | Draft; approved |
| #107 | performance | Draft; paused: merge, adopt none of its fixes |
| none | portable-math, rust-threads | In flight with Codex, no PR yet |

## Waiting for Kyler

1. **The README's three new lines on the forces** (keys, Power and Size, **Slow forces**): read them once as a player.
2. **The release gate (D385):** anything he finds in the water or the editor's core blocks the next release until it is
   fixed.
3. **Defaults he can overrule:** `docs/decisions-pending.md` (the High look's, #83 and #110–#117). Weather-days and M9b
   hold their own on their branches.
4. **His eye, when ready:** M9b's review set; the Weather sitting; the page session's checkpoints.
5. **Held Dependabot majors** #24 (TypeScript 7.0) and #25 (@types/node 26): a quiet housekeeping slot (D150, D283).

## The release gate (D385–D387)

The water and the editor's core must be perfect before the next release; the editor-core items and the coherence review that
follow are in [ROADMAP.md](../ROADMAP.md) ("Before the next release").

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
