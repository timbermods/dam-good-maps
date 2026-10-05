# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-05, the milestone session handed over (Kyler's usage on its account ran low); a new milestone session continues
on another computer. `dev` is clean.

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0). After it, two releases that changed `main` only:
`roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex) and `needs-kyler-ping-done` (the label pings Kyler's phone).
Every released step's tag: `git tag -l '*-done'`. `dev` is far ahead of `main`: the next release is Kyler's call.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It reviews every PR, merges, releases and hands out
  decision numbers (**next free: D476**). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high, D468; worktree `DamGoodMaps-page`, `feature/page`, PR #163) builds "The page is the
  editor".
- **The renderer session "forces play"** (Kyler's PC, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play (#311). The old renderer session is closed.
- **Codex** (both machines) builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. Everything merges through the milestone session's review and green CI; human-facing ones need
`approved` (D470); Rust and core PRs also need a full CI run by hand (`gh workflow run ci.yml --ref <branch>`), since a PR
into `dev` runs only the light set and the merge-queue ruleset doesn't exist yet.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| #317 | Saving review, milestone half (#296) | milestone | Merging on green (the three storage messages set to Kyler's short text) |
| #314 | The Rust analysis (#157, D391) | analysis session | Merging after a green full run; its session asks on #236 for the TypeScript to be tagged before it's deleted |
| #310, #312, #313, #315 | Codex reports: page QA, force playback, custom sizes, long session | Codex | Merging as records; Kyler's verdicts are in ROADMAP's "Codex adoptions" |
| #311 | Every force plays smoothly | renderer (forces play) | `needs-kyler`: merges once green and Kyler has played it |
| #304 | The forces share rust/water's kernel | milestone | Conflicts: reconcile with D474's re-pins (#308) and Deposit (#301), rebuild forcesWasm.ts, every pin unchanged |
| #265 | Badwater line, wave check, wider names (generator 0.8.1) | theme critique session | `needs-kyler`: first of the generator queue; Kyler asked for three facts (the sheets' red marks, badwater's share against the official maps, Delta seed 16's start water); Lake Basin's lake is mostly badwater on 17 of 20 sheet seeds |
| #261 | Canyon and Highlands height (generator 0.9.0) | Canyon session | `approved`; adopted in the generator queue's order, re-pinned |
| #235 | Islands round 6 | Islands | `approved`; adopted in the generator queue's order, re-pinned |
| #163 | The page is the editor | page | `needs-kyler` and `approved`; CI failing; merges once green, reviewed |
| #275 | Forces end the moment their land is final | **unowned** (the old renderer session closed) | `approved`; conflicts and two `forcesSitting` failures; suggest the forces-play renderer session takes it, as it overlaps #311 |
| #225 | A source's highlight reads under its own water | **unowned** | Fails the palette test (a hard-coded colour); suggest the forces-play renderer session, or close it if #311 supersedes |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Parked until after the Weather view; reconcile its rust/water patch with multi-core and water speed; two doubts listed in ROADMAP |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #79, #73, #71, #35 | Source groups, weather days, 3D step 1, Real places 2 | parked drafts | #79 is redundant (to close); the others are parked by Kyler |

## Left for the next milestone session, in order

1. Merge what's still running above (#317, #314, the four Codex reports) if the chain didn't finish.
2. The adoptions Kyler decided (ROADMAP, "Codex adoptions"): #313's fieldData width fix (src/core/gen/generate.ts); #315's
   LS1 (drop backgroundCheck's unused canonical run, src/worker/session.ts); #310's F3 folded into the next generator re-pin
   only. #310's F1 and #312's page.patch go to the page session; #312's renderer.patch and worker.patch to the renderer
   session after #311 (page part before worker part).
3. #304: reconcile and merge.
4. The generator queue, one re-pin at a time, once Kyler approves #265: the badwater line (#265), then Delta arms round 2
   (#233), Lake Basin round 3 (#234), River Valley round 2 (#244), Islands round 6 (#235), Canyon and Highlands (#261).
5. Settle with Kyler who owns #275 and #225.
6. Then, by the roadmap: the Rust checks (#207), custom map sizes (D357; #313's "every side from 4" question is Kyler's then),
   the dam sketch after the Weather view.

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (today: #311, #265,
#163). Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it isn't
set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
