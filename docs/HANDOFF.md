# Handoff: the milestone session

> **Kyler's standing rule, before any task (PLAN §20, D316–D318):** compute is a resource, effort matches the stakes,
> and quality is never compromised. Invest in what compounds (shared modules, findings, history); spend little on what
> doesn't (ceremonial reports and captures, re-checking by hand); keep cheap automated checks broad; verify deeply only
> where failure is expensive and hard to see; keep reports short. The cheapest model and effort that does the job
> (§7's table), and a real check before any code change is reported done. The full rule is at the top of `CLAUDE.md`.

**Read this first if you're the new milestone session.** You start with no memory of the last one. This page says what's in
flight, what to do next, how things are run here, and the machine the session runs on (§9). Then read `CLAUDE.md`,
`docs/STATUS.md`, `EDITOR_PLAN.md` (before any editor work), `PLAN.md` §20 (every decision, D1–D357) and `ROADMAP.md`. Kyler
(he/him) owns the project and decides everything.

**Now (2026-09-29):** the session runs on Kyler's main PC, `C:\Users\Kyler\code\` (Ryzen 7 9800X3D, 16 threads, 62 GB); the dedicated machine (§9) is out of allowance. Worktrees are `C:\Users\Kyler\code\DamGoodMaps-<name>`. D218 doesn't apply here: ask Kyler before every probe batch.

**This machine, the next three days** (build order): this PC (Ryzen 9800X3D, 8 cores, 16 threads) is the machine until the dedicated one is back; Kyler uses it on and off, mostly to play Timberborn. All batches run in parallel. Heavy jobs (M9b's generation batches, full suites, captures) run at normal priority and don't pause for him. Share the threads: set each job's workers and threads so the jobs running at once don't oversubscribe the 16. Probe batches only with his yes each time, and never while Timberborn is running.

**History:** paused on 2026-09-26 on Kyler's main PC; resumed the same day on a dedicated computer (§9). Paused again on
2026-09-27 at about 21:00 PDT, when Kyler's allowance ran out; **resume on Tuesday 2026-09-29 at 8:01 PDT**. Kyler is back
at the terminal: ping him (§7) when something waits for his eye. Nothing merges into `dev` without his yes, except
housekeeping (D286 (5)) and investigation PRs at a boundary.

## 1. Resume here: the order of work (paused 2026-09-27, evening)

**Kyler's build order (2026-09-29) lifted the hold:** six batches, D321–D326, in item 4 below. **Real places is parked (D319).** **One forces branch (D320):** Glaciate is folded into `feature/forces`, and the preview deploys from it.

**Start:** open the milestone session in `C:\Users\krams\code\DamGoodMaps` at Opus 5.5, high (D251), so `.claude/agents/`
load. Start `tools\keep-awake.ps1 96` in the background (§9). Run `git fetch --all` and `git worktree list`; every worktree
was clean and matched its branch on origin at the pause (§2). **Nothing is running:** every agent stopped at a clean
point, with everything pushed. The summary for Kyler is at the top of `docs/STATUS.md`. Send each kind of work to its
definition (§7's table, D301).

**M9a is released** (`m9a-done` at c31a77e, release PR #80, `main` at a4af2bb0; live check passed; generator 0.7.0). The
editor is where the magic happens; the generator provides the canvas (D282). **First among the work: get the forces
sitting's changes (D312–D315) onto the preview and tell Kyler.**

Each workstream below: branch and last commit, state, the exact next step, its definition and model, what it waits on,
and whether it's held for Kyler. Each branch's progress doc (`docs/progress/<name>.md`, top note) has the detail.

1. **Done 2026-09-29: items 35, 38 and 39 applied** (D316–D318). The standing rule is at the top of `CLAUDE.md` and
   of this page; every definition in `.claude/agents/` names its full model id (`claude-opus-5-5` or `claude-sonnet-5-5`,
   efforts unchanged); Claude Code resolves "sonnet" to Sonnet 5.5 here (checked 2026-09-29); §7's table is the model plan in force. `build-light`'s first feedback batch tries medium on
   the well-specified items (D318 (2)).
2. Done with item 1: the models (item 38, D317).
3. Done with item 1: model and task suitability (item 39, D318).
4. **The six batches** (Kyler's build order, `docs/feedback/2026-09-29-build-order.md`; PLAN §20 D321–D326; all started 2026-09-29 and run in parallel;
   short reports, real checks, nothing ceremonial). Each: branch, worktree, definition and model, state.
   - **Batch 1, the forces** (D321; items 7, 13, 14, 17, 18, 25, 29, 30, 40, 41; D327's curved faults and fissures after item 41's path piece): `feature/forces`, `DamGoodMaps-forces`,
     `build` (Opus 5.5, high); started 2026-09-29. Order: 29 and 30, then 40 (absorbing Erode's Floor), 7, 41 and 13
     (one freehand-path piece), Carve's 17, 25, 18, Erupt's 14; item 27's check at edges once batch 5 makes the lip callable.
   - **Batch 2, the brushes** (D322; items 15, 37, 2, 31, 42): `feature/brushes`, `DamGoodMaps-brushes`, `build`
     (Opus 5.5, high); started 2026-09-29. Item 15 first; the stroke record changes once (D158).
   - **Batch 3, Select, Delete, the shelf and shortcuts** (D323; items 11 with 32, 12, 1, 44, 6, 43, 16, 46, 20, then 9; D328, placed objects fit the land, with 11 and 32):
     `feature/select-shelf`, `DamGoodMaps-select`, `build-light-medium` (Sonnet 5.5, medium; D318 (2)'s trial: its
     report says in one line whether medium matched high); started 2026-09-29. Owns the key map: updates the shortcuts
     and first-run hints once after batches 1 and 2 land.
   - **Batch 4, the look** (D324; D310's option (a), then items 5, 10, 4 with D231's leftovers, 28, then badwater's
     calibration once): `feature/high-look`, `DamGoodMaps-high`, `build-light` (Sonnet 5.5, high); started 2026-09-29.
     Item 3 waits for Kyler's High look sitting.
   - **Batch 5, M9b** (D325; items 47, 36, 26, 27, 22, 21, 24; step 4 as amended by D329, time to an editable map): `feature/m9b`, `DamGoodMaps-m9b`, `m9b-build`
     (Opus 5.5, xhigh); started 2026-09-29. One re-pin (D308) after every map-changing item; see item 8.
   - **Batch 6, documents** (D326; items 33, 23, then 34): `dev`, the main clone, `routine` (Sonnet 5.5, medium);
     started 2026-09-29.
   Batches 2 and 3 merge into `feature/forces` in the order 3, 2, 1. When all three are in, the session deploys the
   preview from `feature/forces` and sends Kyler one checklist for one sitting. **Held:** Real places (D319), items 19 (Spring) and 45 (flow arrows).
5. **Item 34, at the forces release boundary** (batch 6, D326; converts existing files, adds no parallel ones):
   `docs/ARCHITECTURE.md` includes D342 (operations only, a headless core, questions as plain core functions, reasons for every refusal, contract tests on the core).
   STATUS §7's workstream table becomes `docs/WORK.md` (claim before starting); the progress docs' top notes become
   fixed-format hand-back notes; STATUS shrinks to its short summary and drops "Decisions since M8"; PLAN §20 splits one
   file per decision in the same pass as item 33's statuses; tests are renamed as the specification only when touched.
6. Item 33's documents are written (`docs/HISTORY.md`, `docs/progress-log/`, `docs/chats/`; D326); the per-decision
   statuses come with item 34.
7. **The forces on the preview.** `feature/forces` (#77) carries D309, D312–D315, Glaciate and the sounds. Batch 1 builds on it;
   batches 2 and 3 merge back into it (item 4). Known snag for batch 1: when a force sweeps the map's last badwater spring,
   the "No badwater" notice (D213) covers the force rows. After Delete sources, CI's headless browser sometimes shows a few
   blueberry bushes gone once the water preview runs on (not in Chrome; the operation is exact); a `build` agent looks at it.
   **Held for Kyler:** the forces release only after his sitting.
8. **M9b** (`m9b-build`, Opus 5.5 xhigh; `feature/m9b`, #70 draft, `DamGoodMaps-m9b`): source groups wired (284818ad),
   the badwater toggle on a narrow mouth follows D290 (#134; its editor side lands with the forces), badwater ditches no
   longer ruler-straight, the sea's rim wanders. The re-pin is half done: quick suite on d5dd375f 765 passed, 10 failed
   (9 map-bound; one resources share at 0.5225 against its line under 0.52: look at it first). The "Handoff" section of
   `docs/progress/m9b.md` has the ten tests, their seeds and the commands. **Next:** merge `origin/dev` (M9a, 0.7.0,
   released), re-seed the six seed-bound tests, re-pin the 4242 sha, rerun `npx vitest run --project quick
   --maxWorkers=4`; then samples under D308 and the release candidate: full batches, one pooled probe batch (3D maps,
   Erode, a Real places sample, M9b maps), then the review set for Kyler. **Held for Kyler:** judged by his eye (D252,
   D273). The feedback items (21, 22, 24, 26, 27, 36, 47) are batch 5, D325: its order is in `docs/feedback/2026-09-29-build-order.md` (the height budget first, then the trees and the start, the edge lip, candidates and speed, one re-pin, the numbers as data only, the release candidate).
9. **Parked by Kyler (D319) until he says it resumes; #35 stays open, its red CI expected.** **Real places, round 2** (`build`, Opus 5.5 high; then `build-light` for the release; `feature/real-places-2`, #35,
   `DamGoodMaps-places`): **the rebuild is paused** (Kyler, 2026-09-27) until the grouped-sources rule is in its
   conversion (D314). That rule is now wired in (VERSION 11: heads and lake springs as rows, the water floor's spring as
   a group, badwater grouped); the conversion started and stopped at the pause with 37 of 136 places done and cached. CI
   on #35 is red until the rebuild (tests are for the new rules, the gallery still D271's). **Next:** from
   `DamGoodMaps-places`, keep VERSION 11 and run `npx tsx tools/places-convert.ts --threads 3` (about 1.5–3 h for the 99
   left), then build, draw the cards and check it yourself, as the top note of `docs/progress/real-places.md` lists:
   every place passes the blocking list, "No water a pump can reach" is 0, the stripes are gone on 42, 48, 116 and 118.
   Then release `real-places-2-done` (no new sheet for Kyler, D300). From item 47, real places take only what never changes the real land (D331; PERFECT.md's Real places section); item 27 still waits with D319.
10. **Grouped sources** (D314): the investigation `investigation/source-groups` (#78) is merged into `dev`
   (685d9b18). The rule itself is `feature/source-groups` at a6346fe4 (#79, draft): merge it into `dev` with the first of the branches
   that carry it (M9b, Real places, the forces, Glaciate), not before Kyler's yes on that branch.
11. **Held for Kyler, nothing to do until he answers** (STATUS §1): the High look's sitting (item 3's verdict; D310's option (a) is settled, batch 4); the High look (#75, `build`); Drought and Badtide day by day
   (#73, `feature/weather-days`, D307's flooded floor done; `build`, then `build-light` for the fixes from his sitting).
12. **Erode: merged into `dev` as an investigation (be2342a2, #74 at 47c02e67, rounds 2–9, Kyler's approval); adoption at 3D step 3.** Earlier notes: Kyler approved round 2 ("magical, almost perfect") and round 3
   (89305ca6) landed and was approved: its flat-ground wash. Round 4 is with Codex now, narrow: washes across
   uneven ground, and telling a wash sweep from a cliff sweep. **Next:** wait for Codex's round 4; when it lands,
   check the automatic support check passes (0 dropped voxels); then hold #74 for Kyler's look; merge it as an
   investigation on his yes. **#74 stays open; don't merge it: round 7 (roofs) is with Codex.** Adoption into the editor stays at 3D step 3 (after the 3D view), on the forces core
   under the forces' rules (fast by default with Watch, item 29; changing things only when the force reaches
   them, item 30; no refusals; one size ring).
13. **3D terrain, step 1** (`build`; `feature/terrain3d-a`, #71 draft, 24b88b9b): new modules, verified against the game
   (terrain3d-20260927 probe). **Next:** the wiring, after the forces and M9b merge into `dev` (D280).
14. **Then, per ROADMAP.md:** the High look's release right after the forces' (D284), "The page is the editor" (D232–D234,
   D237) — **Kyler's priority (feedback item 23): it follows the forces' release without delay, as one window for the
   generator and the editor. Its brief is `docs/UI-BRIEF.md` (D330, from Kyler's UI round on `docs/UI-QUESTIONS.md`), approved by Kyler on 2026-09-29; built right after the forces' release
   on `build` with item 34's split of the editor's giant files into feature folders; when it's rebuilt, "Refine this map", the expand button and the Legend button join `tools/retired-terms.json`. It also draws
   item 22's strip and item 24's number.**, Kyler's editor UI audit and the design pass (D236), the four
   terrain-above-terrain steps (D279–D281), the Weather view (D285), housekeeping (D283 (3); includes the three stale
   capture tools and the held Dependabot majors #24, #25).

**Pending numbers across branches** (renumber at merge): M9b's decisions-pending #134 is its own branch's; the next free
number on `dev` is **#94**. The next decision is **D358**.

## 2. Branches at the pause (2026-09-27, evening)

Worktrees are on this machine (§9), under `C:\Users\krams\code\`. The main clone `DamGoodMaps` is on `dev`. Every one was
clean and matched origin at the pause.

| Work | Branch | PR | Worktree | Last commit | State |
|---|---|---|---|---|---|
| Documents (batch 6, D326) | `dev` | — | `DamGoodMaps` | see `git log` | `routine`; started 2026-09-29; M9a released |
| The forces (batch 1, D321) | `feature/forces` | #77 | `DamGoodMaps-forces` | see `git log` | `build`; started 2026-09-29 |
| The brushes (batch 2, D322) | `feature/brushes` | none | `DamGoodMaps-brushes` | new | `build`; started 2026-09-29; merges into `feature/forces` |
| Select, shelf, shortcuts (batch 3, D323) | `feature/select-shelf` | none | `DamGoodMaps-select` | new | `build-light-medium`; started 2026-09-29; merges into `feature/forces` first |
| Sounds and Delete sources | `feature/forces-sounds` | #81 | `DamGoodMaps-sounds` | a1aced41 | merged into `feature/forces`; removable |
| Glaciate's adoption | `feature/glaciate` | #76 | `DamGoodMaps-glaciate` | e091e77a | retired by D320: folded into `feature/forces`, #76 closed |
| M9b (batch 5, D325) | `feature/m9b` | #70 (draft) | `DamGoodMaps-m9b` | 66146f34 | `m9b-build`; started 2026-09-29; one re-pin after every map-changing item; held for Kyler's eye |
| Real places, round 2 | `feature/real-places-2` | #35 | `DamGoodMaps-places` | cbaf6cf6 | parked (D319); 37 of 136 converted under VERSION 11, cached in the draft release `cache-real-places-2-v11` |
| Grouped sources, the rule | `feature/source-groups` | #79 (draft) | `DamGoodMaps-groups` | a6346fe4 | merges with the first branch that carries it |
| Grouped sources, the investigation | `investigation/source-groups` | #78 | `DamGoodMaps-sources` | 1e760899 | merged into `dev` (685d9b18); removable |
| The look (batch 4, D324) | `feature/high-look` | #75 (draft) | `DamGoodMaps-high` | 86eddaea | `build-light`; built 2026-09-29, CI green; held for Kyler's High look sitting |
| Drought and Badtide day by day | `feature/weather-days` | #73 (draft) | `DamGoodMaps-weather` | 5bb13406 | held for Kyler's sitting |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 (draft) | `DamGoodMaps-3d` | 24b88b9b | wiring waits for the forces and M9b on `dev` |
| Erode investigation | `investigation/erode` | #74 | `DamGoodMaps-erode` (Kyler's demo runs here) | 47c02e67 | merged into `dev` (be2342a2), rounds 2–9 approved by Kyler; adoption at 3D step 3 |
| The ceiling probe (D244 step 1) | `chore/ceiling-probe` | none | `DamGoodMaps-ceiling` | a0be2aaa | done; already in `feature/forces` |
| Kyler's review worktree | `review/m9a-set` | — | `DamGoodMaps-review` | 6575ebc9 | the M9a review set; not written to by agents |

Finished and merged, removable when convenient: `DamGoodMaps-m9a`, `DamGoodMaps-live`, `DamGoodMaps-waterfalls`,
`DamGoodMaps-fixes`, `DamGoodMaps-nightly`, `DamGoodMaps-house` and `DamGoodMaps-carve-check` (detached at 6b9d4e63, which
is on origin).

## 3. Jobs to restart

At the pause no batch, probe run or render was running; the watchers (CI, the #78 merge) ended with the session, and the
keep-awake script is started again (§9). Two jobs to restart:

- **Real places' conversion: parked (D319).** When it resumes on this PC, first fetch the land data this PC lacks (`npx tsx tools/places/worldcover.ts`, then `tools/places/osm.ts`), and unpack the draft release `cache-real-places-2-v11` into `investigation/landscapes/local/real-places-2/`. Then, as recorded at the pause (37 of 136 done): from `C:\Users\krams\code\DamGoodMaps-places`,
  `npx tsx tools/places-convert.ts --threads 3`. It skips the 37 already cached in
  `investigation/landscapes/local/real-places-2/v11/`; the land is cached in `investigation/landscapes/.cache/`
  (patches, worldcover, osm). Heavy: run it when no batch runs.
- **M9b's quick suite** after its re-seed: `npx vitest run --project quick --maxWorkers=4` in `DamGoodMaps-m9b`. Its
  old per-theme batches in `investigation/m9b/local/batches/` predate the game's rules: don't resume them.

## 4. M9a and Live editing

Both are released: M9a as `m9a-done` (2026-09-27, #80), Live editing as `live-editing-done`. Their records are in
`docs/progress/m9a.md` and `docs/progress/live-editing.md`; what's released is in `docs/STATUS.md` ("Released or merged").

## 5. Merged, released, held and waiting

- **Live on `main`** (a4af2bb0): everything to `m9a-done`, generator 0.7.0.
- **Held for Kyler:** the forces and Glaciate (his sitting), M9b (his eye), the High look and the water shades (D310),
  Drought and Badtide day by day.
- **Waiting on Kyler:** STATUS §1.

## 6. Open questions

STATUS §1 lists everything waiting for Kyler, with the defaults pending. `docs/decisions-pending.md` holds the defaults
the session chose. **Held Dependabot majors:** #24 (TypeScript 7.0), #25 (@types/node 26), for a quiet housekeeping slot
(D150, D283).

## 7. How things are run here

- **Progress log** (D221): a short, plain comment on [#57](https://github.com/timbermods/dam-good-maps/issues/57) each time
  a step finishes, something is released, a probe batch runs or something is parked for Kyler (what happened, links, what's
  next). `docs/STATUS.md` stays the full record, with its summary at the top.
- **Pings (D332):** the moment Kyler's attention or input is needed (a decision only he can answer, anything ready for his eye, an approval, a probe batch awaiting his yes, work stuck on his side, anything broken he sees or plays), never for progress, green CI or information. Each ping: one or two lines on what's needed, where, and what carries on meanwhile; batch non-urgent asks; never wait silently. The toast: `powershell -NoProfile
  -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body "<where>"` (a Windows toast on this
  machine; the PushNotification tool is skipped while he is at the terminal), a chat line such as "🔔🔔 … 🔔🔔", and one line on #57.
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; give each e2e run its own free port; CI runs the specs in four parallel shards, `--shard=i/4`, so a run there is `browser (i/4)` jobs, not one long job),
  `npm run oracle` (the Python validator, 0 disagreements), `npm run batch` (`tools/batch.ts`, ≥ 98% final blocks),
  `npm run places -- --check`. The Claude suite (`npx tsx investigation/claude/bin/reference.ts`, D134) is kept but
  unmaintained and left out of the regular checks while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=feature/forces` (D320), then check
  <https://timbermods.github.io/dam-good-maps/preview/> (noindex). A normal deploy of `main` drops `/preview/`, so republish
  it after every release.
- **Releases** (CLAUDE.md, "Deploying"): tag a green `dev` commit (annotated tags; names in CLAUDE.md), push the tag and a
  `release/<name>` branch at it, open a PR into `main`, wait for its checks, merge **as a merge commit**, watch the push deploy
  (build, deploy, `live-check / live`), republish the preview, record it in `docs/STATUS.md` and the progress log.
  `tools/release.sh <tag> <commit> <PR body file> [<preview branch>] [--go]` does all of it (without `--go` it only
  checks and prints the steps). If the live check fails, revert the release merge on `main`.
- **Fixes for dev's own failing tests go to dev directly**, never only onto a feature branch (Kyler, 2026-09-26): the
  drowned-relic fix for issue #55 sat on the Real places branch for a day while dev's nightly failed.
- **Investigation PRs** (Codex's and others): merge at the next boundary as a merge commit once green, adopt their
  INTEGRATION.md as proposals; anything that conflicts with a decision becomes a pending decision with a default. Hold any PR
  Kyler says Codex is still working on.
- **Where probes run** (Kyler, 2026-09-30): every probe runs from one dedicated worktree, `C:\Users\Kyler\code\DamGoodMaps-probe`,
  whose four runner commands are in Kyler's allow rules (`npm --prefix C:/Users/Kyler/code/DamGoodMaps-probe/investigation/probe run`
  `build-mod -- --no-install`, `batch -- --backup-settings`, `batch -- --group …`, `restore`). Before a probe, check out the
  branch that needs probing there, detached (`git checkout --detach origin/<branch>`, the probe's own code included), run
  `npm ci` at the root and in `investigation/probe` if the lockfiles changed, then run from that folder. Always print the
  plan and check it before launching: the right maps, a sensible time, no fallback to a bigger batch. The map writers some
  groups need first (`tools/probe-3d.ts`, `tools/probe-parity.ts`) are not among the four rules: if one is refused, leave
  the batch for Kyler. **Being replaced (Kyler, 2026-09-30):** `batch --group <name>` writes that group's maps first, from the group's own
  writer, then runs them, and prints the maps written as part of the plan; so the four commands cover every group, now
  and later. Built on `chore/probe-sizes` and applied to the Parity group on `feature/parity`; the 3D group gets it when
  it merges.
- **DGM Probe** (`investigation/probe`): the only way Claude may launch Timberborn, and **only after Kyler's yes in chat for
  that batch, every time** (CLAUDE.md, D117). **On this machine only (§9), D218 lifts the ask:** run a batch whenever the plan
  calls for one, and report it in STATUS and on #57; everything else below still applies. Elsewhere, ask in one message: how
  many maps, which checks, how long, and that it launches Timberborn. Steam running, Timberborn closed, the machine quiet
  (the runner waits for it). Build the mod with `run build-mod -- --no-install` (without it, `build-mod` also installs the mod
  into `Documents\Timberborn\Mods`; the batch installs and removes it itself). Kyler plays with his installed
  mods (`--keep-mods`). Make a settings backup first (`--backup-settings`); pass it as `--reference <backup .reg>`. Running
  without `--confirmed-launch` prints the plan and a one-time code; after Kyler's yes, rerun with `--confirmed-launch <code>`.
  Results go to `C:\dgm-probe\` (never Documents). The runner restores his settings, logs and player data, moves anything the
  games created out of `Documents\Timberborn`, and stops with exit code 6 if anything new is left (`leftovers.json`). Example:
  `npm --prefix investigation/probe run batch -- --only <ids> --keep-mods --run-id <id> --confirmed-launch <code> --reference C:/dgm-probe/settings-backup/<stamp>/Timberborn-settings.reg`.
- **What every session does** (D332): pings Kyler the moment his attention or input is needed (Â§7, "Pings"), and never waits on him silently.
- **Merging** (D341): nothing merges into `dev` red, ever; a feature branch merges green too, except by Kyler's explicit word. No test stays known-flaky: one that passes and fails on the same commit has its cause found and fixed.
- **What every milestone and handoff does** (D326): at each month's end, copy the Progress log (#57) to
  `docs/progress-log/YYYY-MM.md`; when `docs/CHAT-HANDOFF.md` is rewritten, keep the previous version as
  `docs/chats/<date>.md`; add any new major turn to `docs/HISTORY.md`; skim the living docs against what was just built
  (CLAUDE.md, D188).
- **A finding worth keeping** (D316): it gets a line in [docs/FINDINGS.md](FINDINGS.md), with its number or rule and a link to where it is measured; a finding a later one replaces is marked stale, not dropped.
- **Decisions:** Kyler's decisions go into `PLAN.md` §20 (the next is D358), and into the living docs in the same change
  (D188: EDITOR_PLAN, PLAN, ROADMAP, CLAUDE.md, STATUS). The next pending number is #94 ("Pending numbers across branches", §1;
  M9a's #87–#90 and #93 are in, #80–#82 are Real places' defaults on #35's branch). **Every review is measured against
  [docs/PERFECT.md](PERFECT.md)** (D225); read it before M9b. Defaults chosen while Kyler is away
  go into `docs/decisions-pending.md`, marked as a default the session chose.
- **Which work goes to which agent definition** (`.claude/agents/`, D210, D251). A session loads them only at its start,
  and only when it starts in `C:\Users\krams\code\DamGoodMaps`; start the milestone session there, at Opus 5.5, high.

  **D301 (in force since 2026-09-27):** Opus where judgment is the product, Sonnet where the job is written down, scripts where it's
  only waiting.

  | Work | Definition | Model, effort |
  |---|---|---|
  | M9b | `m9b-build` | Opus 5.5, xhigh |
  | (idle: M9a is released) | `m9a-build` (kept) | Opus 5.5, xhigh |
  | The forces and the fixes from Kyler's sitting, the Glaciate adoption, the 3D foundations and water engine (wiring after the forces and M9b merge), the High look's fixes, Erode's adoption; anything touching the water simulation, the generator's processes or the forces | `build` | Opus 5.5, high |
  | Building from a written spec: the Drought and Badtide fixes after its sitting, Real places after its D271/D300 fixes (the badwater stage, the release), rendering review sets and contact sheets, mechanical merges and CI fix-ups without real conflicts (judgment on water, generator or forces goes back to `build`) | `build-light` | Sonnet 5.5, high |
  | Self-contained items with a clear spec (D341) | `build-light-medium` | Sonnet 5.5, medium |
  | Recording decisions, STATUS and the Progress log, consistency sweeps, housekeeping | `routine` | Sonnet 5.5, medium |
  | The milestone session: orchestrating, merging, releasing, probe batches | (the session) | Opus 5.5, high |
  | (none; M9c removed, D278) | `m9-build` (kept, unused) | Opus 5.5, high |
  | Waiting on CI, batches and probe runs | background scripts that report when they finish, never an agent polling | — |


## 8. Lessons from the last sessions

- Windows with Git Bash: use `MSYS_NO_PATHCONV=1` where paths get mangled; bash heredocs with apostrophes break the tool
  wrapper, so write scripts to files; foreground `sleep` chains are blocked (use background commands or until-loops).
  (The old machine's Store Python couldn't read `%LOCALAPPDATA%\Temp`; this machine's Python can.)
- Off-limits: Kyler's `Documents` folder (it holds secrets; never read it); his saves, settings and mods except through the
  probe runner; `C:\dgm-reference\` (his in-game screenshots: look, never copy, crop or commit; **amended by Kyler, 2026-09-29:** thirteen of his Timberborn screenshots, from Steam's screenshot folder for app 1062090, are committed downscaled in `docs/look/reference/timberborn/` as a visual reference for the look only, never as textures or assets, with one read-only copy of his map `pair-map.timber`; nothing else is copied, and nothing else of `Documents` is read); `C:\dgm-workshop\` (other
  creators' maps and local review pages: never commit); the decompiled game code in `investigation/decompiled/` and the
  official maps in `investigation/raw/` (gitignored; for answers only, never copied).
- **Shared machine:** agents stop only processes whose command line names their own worktree (one cleanup once killed another
  agent's batches); every e2e run needs its own free port (Playwright's `reuseExistingServer` silently tested another agent's
  build once). M9a first (D210).
- **Subagents:** if Kyler stops one, it can't be resumed: start a new one in the same worktree and tell it the exact state
  (running processes, last commit, what's left). Some hand back before their CI finishes; check the PR yourself.
- **Merges between steps that change generated maps** conflict on the generator version and the pinned seed-4242 sha
  (`tests/contract/look-mine-ruins.test.ts`); re-pin per D148 and bump the version (0.7.0 is M9a's).
- **The Claude suite** drifts whenever the generator changes; re-tuning it is suspended while M12 is deferred (D134, D277).
- **Repository size** (D195): investigations commit reports, code, small samples and a few captures; bulk results stay in a
  gitignored `local/` folder or a GitHub Release. #45 added about 98 MB before the rule; history isn't rewritten.
- **Retired terms** (`tools/retired-terms.json`, D188): CI fails if a retired name or retired interface text reappears in the
  living docs or `src/`; `pendingRemoval` is empty now.
- **The review rule:** no blind reviews; Kyler judges visual work from before/after captures (with greyscale and
  colour-blindness sheets). Only breakage, his decided principles and what a player feels block (D115, D145).
- **Where to look:** `docs/STATUS.md` (the current state and the morning summary), `docs/progress/` (one log per step),
  `docs/README.md` (which docs are living), `docs/CHAT-HANDOFF.md` (how Kyler's planning chat works).

## 9. This machine

A computer kept for this work (Kyler, 2026-09-26): always on, nobody plays on it. Windows 10 Pro 22H2 (19045), Ryzen 5 3600
(12 threads), 32 GB. User folder `C:\Users\krams`.

- **Repository:** `C:\Users\krams\code\DamGoodMaps` (on `dev`) and the worktrees in §2, beside it. Start sessions in the
  repository folder, so `.claude/agents/` load.
- **Tools** (per user, no administrator rights, installed 2026-09-26): Node 22.23.3 (`~\tools\node-v22.23.3-win-x64`,
  npm 10.9.9); Python 3.12.10 (`~\tools\python312`, python.org's NuGet build, with numpy and pillow from
  `prototype/requirements.txt`); the .NET 8 SDK 8.0.425 (`%LOCALAPPDATA%\Microsoft\dotnet`; the machine-wide
  `C:\Program Files\dotnet` has only SDK 3.1); ilspycmd 8.2.0.7535 (a .NET global tool); gh 2.101.0
  (`C:\Program Files\GitHub CLI`, logged in). They are on the user PATH and in `~/.bashrc`. The Bash tool doesn't read
  `~/.bashrc` by itself: start commands with `. ~/.bashrc;`. There is no PowerShell profile (it would live in `Documents`).
- **Timberborn:** Steam at `C:\Program Files (x86)\Steam`; the game at
  `C:\Program Files (x86)\Steam\steamapps\common\Timberborn`, version `1.1.2.4-52e959e-sw` (Steam build 25096761), the same
  build the repository was verified against (FORMAT.md). Keep Steam running; Timberborn stays closed unless the probe
  launches it.
- **Decompiled code:** `investigation/decompiled/` regenerated on 2026-09-26 with `investigation/decompile_all.sh` (497 files,
  about 2 minutes).
- **Official maps:** extracted with `investigation/extract_builtin_maps.py` and kept in `.scratch/official/` (19 official
  maps and 3 unnamed ones), deliberately not in `investigation/raw/builtin/`: the local-only tests there also expect the
  workshop copies (at least 30 maps), which live on Kyler's main PC, so with the official maps alone they would fail here.
- **Not on this machine:** `C:\dgm-workshop\` and `C:\dgm-reference\`. Work that needs them waits for Kyler's main PC.
- **DGM Probe:** results in `C:\dgm-probe\`; the settings backup is
  `C:\dgm-probe\settings-backup\2026-09-26T19-19-16\Timberborn-settings.reg`; the runner's tests pass and the mod builds
  against this install.
- **Staying awake:** the power plan (Ultimate Performance) never sleeps or hibernates on mains power. While working, run
  `powershell -NoProfile -ExecutionPolicy Bypass -File tools\keep-awake.ps1 96` in the background: it holds a "system
  required" request (as a video player does) and changes no settings. It ends with the session that started it, so
  start it again in every new session.
- **Worktrees:** `C:\Users\krams\code\DamGoodMaps-<name>`, one per branch; §2 lists them. Each has its own
  `node_modules`; run `npm ci` in one only if its `package-lock.json` changed.
- **Restarts:** automatic updates are off by policy (the last update is from 2023), so no update restart is scheduled or
  likely. Windows restarts itself after a system crash. After any restart: start a Claude Code session in the repository
  folder, read this page, start the keep-awake script, check `git worktree list` and §2, and if a probe batch was running,
  run `npm --prefix investigation/probe run restore` before anything else.
- **When the game updates:** recompute the starting-logs floor (D224) with `npx tsx tools/log-floor.ts --check` (then
  `--write`, and record the new floor in PLAN §20); regenerate `investigation/decompiled/`; note it in STATUS.
