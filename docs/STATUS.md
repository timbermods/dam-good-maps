# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-05, the milestone session runs on Kyler's PC (clone `C:\Users\Kyler\code\DamGoodMaps`), shared with the renderer
session, which comes first: local runs use about half the threads and CI does the rest; probe batches need Kyler's yes in
chat (D117). The page's worktree is `DamGoodMaps-page`, the probe folder `DamGoodMaps-probe`.

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
  Carve's smooth play (#311, merged 2026-10-05); next the Craterize fix, then #275, then #312's renderer and worker parts. The old renderer session is closed.
- **Codex** (both machines) builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. Everything merges through the milestone session's review and green CI; human-facing ones need
`approved` (D470); Rust and core PRs also need a full CI run by hand (`gh workflow run ci.yml --ref <branch>`), since a PR
into `dev` runs only the light set and the merge-queue ruleset doesn't exist yet.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| #261 | Canyon and Highlands height (generator 0.9.0) | Canyon session | `approved`; adopted in the generator queue's order, re-pinned |
| #235 | Islands round 6 | Islands | `approved`; adopted in the generator queue's order, re-pinned |
| #163 | The page is the editor | page | `needs-kyler` and `approved`; CI failing; merges once green, reviewed |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Parked until after the Weather view; reconcile its rust/water patch with multi-core and water speed; two doubts listed in ROADMAP |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler (#79 closed as redundant) |

## Left for the next milestone session, in order

1. Done on 2026-10-05: #313's fieldData width fix and #315's LS1 (#319), #304 (the forces run rust/water's kernel) and the Rust checks (#321, tag `ts-checks-final`),
   each merged after a green full run, no pin moved; #310's F3 landed in #265's re-pin. Still to land: #310's F1 and #312's page.patch are the page session's; #312's renderer.patch and worker.patch the renderer
   session's, now that #311 is merged (page part before worker part).
2. Merged on 2026-10-05 and 06: the Craterize fix (#322), Naturalize rule 4 (#324), #275, #225 and #323 (forces play's),
   Delta arms round 2 (#325, generator 0.8.2). In flight: CI for investigation-only PRs (#327) and the roadmap canvas
   reading dev's latest commit (#328), each merging on green.
3. Then the generator queue, one re-pin at a time, each with its sheets for Kyler: **badwater joins the main water** (D476,
   Kyler 2026-10-05: on most maps a badwater course is routed into the theme's main water, about 15 in 100 drain unsteered;
   replaces the 85-in-100 clean rule and the poisoned-main-river follow-up; generator 0.8.3, `feature/badwater-joins`, in
   progress, with contamination-shaded sheets and two High-look captures), then Lake Basin round 3 (#234,
   `feature/lake-basin-3` at 7ea81d05, built and measured, re-pin waits; its Lake Basin 3 Naturalize failure gets fixed, not
   marked; and Kyler, 2026-10-05: seeds 12 and 15 at 128² have no lake on dev yet pass, against D464: fix why the generator
   makes them and why the promise passes them, in this re-pin, both seeds on its sheets), River Valley round 2 (#244), Islands round 6 (#235), Canyon and Highlands (#261).
4. Then, by the roadmap: custom map sizes (D357; #313's "every side from 4" question is Kyler's then),
   the dam sketch after the Weather view.

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (today:
#163). Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it isn't
set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
