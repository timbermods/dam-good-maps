# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-07, the milestone session runs on Kyler's PC (clone `C:\Users\Kyler\code\DamGoodMaps`), shared with the renderer
session, which comes first: local runs use about half the threads and CI does the rest; probe batches need Kyler's yes in
chat (D117). The page session runs in a cloud container (not the `DamGoodMaps-page` worktree); the probe folder is
`DamGoodMaps-probe`.

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0). After it, two releases that changed `main` only:
`roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex) and `needs-kyler-ping-done` (the label pings Kyler's phone).
Every released step's tag: `git tag -l '*-done'`. `dev` is far ahead of `main`: the next release is Kyler's call.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It reviews every PR, merges, releases and hands out
  decision numbers (**next free: D480**). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high, D468; a cloud container, `feature/page`, PR #163) builds "The page is the
  editor".
- **The renderer session "forces play"** (Kyler's PC, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play: #311, #322 (Craterize), #275, #225 and #323 (#312's renderer part) are merged. Next: #329 (the lake
  jump), #312's worker part once the page part reaches dev with #163, and Deposit's outline (#341, waiting on Kyler's answers).
- **Codex** (both machines) builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. Everything merges through the milestone session's review and green CI; human-facing ones need
`approved` (D470); Rust and core PRs also need a full CI run by hand (`gh workflow run ci.yml --ref <branch>`), since a PR
into `dev` runs only the light set and the merge-queue ruleset doesn't exist yet.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| #342 | TypeScript 7.0.2 (D460) | milestone | `hold`, draft: one error in the page's src/editor/brushes.ts (TS7022), fixed by investigation/ts7/page.patch, which the page session carries. Once that is on dev: merge dev in, full run and nightly, merge |
| #347 | The page is the editor: #163 squashed (D478), with D352's amendment | milestone | `approved`; `feature/page` at 5faf94d8 (full run 37589532598 green) squashed onto dev; the 350 earlier captures are in the pre-release `page-design-2026-10-07`. Dev (River Valley round 2) merged in; merge on a green full run, then close #163, tell the page session and forces play on #236 |
| #329 | A force starts from the water on screen (the lake jump) | forces play | `needs-kyler`; dev merged in (26abfab5). Waits for #163 (D477): then merge dev in, publish at /preview/, tell Kyler; after his try, republish feature/page |
| #261 | Canyon and Highlands height | Canyon session | `approved`; in the generator queue after Islands round 6, re-pinned |
| #235 | Islands round 6 | Islands | `approved`; in the generator queue after River Valley round 2, re-pinned |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Parked until after the Weather view |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler |

## Left for the next milestone session, in order

1. **Merged on 2026-10-07:** #344 (Naturalize rule 5, D479) and #343 (@types/node 26). Nothing else merges unless green
   and approved.
2. **River Valley round 2 is merged** (#346, generator 0.8.5, 2026-10-07; Kyler approved). Held with it: naturalizeNature's
   River Valley 6 beside Lake Basin 3, one known gap under D479. Kyler's two looks for later, not blocking: seed 9's start
   beside an all-badwater main river (it missed readable water before the round too) and seed 20's new badwater pool. Then Islands round 6 (#235), then
   Canyon and Highlands (#261), one re-pin each with sheets.
3. **#163's squash (D478),** once the page session has it green: make a GitHub Release (for example `page-design-2026-10-06`,
   marked pre-release, not latest) holding a zip of every image in `docs/design/` except the 8 `editor-build2-*` captures
   (`git archive --format=zip -o page-design-captures.zip origin/feature/page <those paths>`); squash-merge #163 onto dev
   without the other images (a branch from dev, `git merge --squash origin/feature/page`, `git rm` the 350 images, a
   DESIGN.md line linking the Release, a PR, green CI, merge); close #163 with a note; ask the page session on #236 to
   restart `feature/page` from dev, carrying over commits made after the squash point. Fold the page's decisions (DESIGN.md,
   docs/progress/page.md) and the D352 amendment (Glaciate last, the forces on Shift+1–7; the page session states it on #236)
   into docs/decisions/.
4. **Then #329** (D477) and **TypeScript 7** (#342), as in the table.
5. **Deposit (#341):** Kyler's answers to its three questions (a drag's changes inside its band; the smallest click's circle;
   small fans in basins) are not yet on #341 or in the docs: ask Kyler, post them on #341, and record any rule.
6. Then, by the roadmap: custom map sizes (D357; #313's "every side from 4" question is Kyler's then), the dam sketch after the
   Weather view.

Done on 2026-10-05 and 06 (details on #57): #319, #304, #321 (tag `ts-checks-final`), #311, #265, #322, #324, #325, #275,
#225, #323, #327, #328, #331, #333, #326 and #332 (records), #334, #336 (record), #337, #330 (D476), #338, #340, #339; Drought
reserve held for settings round 2 and Designed for off that list (D466).

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (today:
#329, #341). Also his: Deposit's answers (#341). Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it isn't
set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
