# Handoff: the milestone session

**Read this first if you're the new milestone session.** You start with no memory of the last one. This page says what's in
flight, what to do next, how things are run here, and the machine the session runs on (§9). Then read `CLAUDE.md`,
`docs/STATUS.md`, `EDITOR_PLAN.md` (before any editor work), `PLAN.md` §20 (every decision, D1–D315) and `ROADMAP.md`. Kyler
(he/him) owns the project and decides everything.

**History:** paused on 2026-09-26 on Kyler's main PC; resumed the same day on a dedicated computer (§9). Paused again on
2026-09-27 at about 21:00 PDT, when Kyler's allowance ran out; **resume on Tuesday 2026-09-29 at 8:01 PDT**. Kyler is back
at the terminal: ping him (§7) when something waits for his eye. Nothing merges into `dev` without his yes, except
housekeeping (D286 (5)) and investigation PRs at a boundary.

## 1. Resume here: the order of work (paused 2026-09-27, evening)

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

1. **Kyler's standing rule: compute is a resource, effort matches the stakes, and quality is never compromised**
   (feedback item 35 in `docs/feedback/2026-09-28-forces-preview.md`): read it first and apply it from Tuesday's first
   task, including to the feedback items' tests and reports. Record it in PLAN §20 as the next free D-number and put
   it at the top of `CLAUDE.md` and of this page, so every session reads it before any task; it applies to every
   session, agent and investigation, and to prompts from the planning chat and Codex.
2. **The models, mandatory, first thing on Tuesday** (feedback item 38): every Opus use is Opus 5.5 (every agent
   definition, task and the session itself; effort levels unchanged; nothing on Opus moves to another model), and every
   use of Sonnet 5 moves to Sonnet 5.5 at the same effort (`routine`: Sonnet 5.5, medium; `build-light`: Sonnet 5.5,
   high; any other place Sonnet 5 is named). Update `.claude/agents/`, the model plan in PLAN §20 (D301) and §7's table
   to match, and read every model named elsewhere on this page (and in STATUS) as the new one.
3. **Model and task suitability** (feedback item 39, from Anthropic's Sonnet 5.5 guidance): add a few short lines to
   item 35's standing rule in `CLAUDE.md`: Sonnet 5.5 for well-scoped work with a clear spec and a way to check it,
   Opus 5.5 for complex judgment and long-horizon work (nothing on Opus moves); keep `build-light` at high for now and
   try medium on the well-specified items of its first feedback batch, keeping whichever gives the same quality for
   less (say which in one line); the real-check instruction for every agent (run a real check that exercises a code
   change before reporting it done, or say which check couldn't run and why); downscale screenshots and captures
   before a model reads them unless the detail is being judged. Update Claude Code on this machine to a version where
   the "sonnet" alias resolves to Sonnet 5.5, and check that every definition in `.claude/agents/` names the model
   it's meant to use.
4. **Kyler's forces-preview feedback** (`docs/feedback/2026-09-28-forces-preview.md`): record the items in PLAN §20 as
   the next free D-numbers, then build them. Bugs first (15, 7, 13, the file-drop bug in 11 with 32 (the leftover placement
   mode), then 12), then 1, 2, 6, 9, 14, 16, 17, 18, 29 (every force fast, with a Watch toggle), 30 (a force changes things
   only when it reaches them) and 37 (the height brushes with a target level, like the game's editor; it replaces item 8)
   on `feature/forces` (29 and 30 also on Glaciate's branch), and last 19 (Spring, a new force) (`build`, Opus 5.5, high);
   20 (Generate always makes a new map), 25 (Carve's Canyon depth and River depth named apart) and 31 (Sources: Ride · Keep
   · Clear) on `feature/forces` (`build-light`, Sonnet 5, high); the look items 4, 5, 10 and 28 (sources drawn like the
   game's) with the water shades work on `feature/high-look` (`build-light`, Sonnet 5, high). Item 3 waits for Kyler's
   verdict. Add each to Kyler's checklist.
5. **The repository documents its own identity and history** (Kyler's decision, feedback item 33 in
   `docs/feedback/2026-09-28-forces-preview.md`; `routine`, Sonnet 5, medium; documents only, once the feedback items
   are under way): record it in PLAN §20 as the next free D-number; write `docs/HISTORY.md` (a short chapter per major
   turn, each linking to its decisions); give every PLAN §20 decision a status (active; amended by Dn; superseded by
   Dn), decisions unchanged; copy the Progress log into `docs/progress-log/`, one file per month, at each month's end;
   keep each previous `docs/CHAT-HANDOFF.md` as `docs/chats/<date>.md` when it's rewritten; add these habits to
   HANDOFF's list of what every milestone and handoff does; note it in STATUS and the Progress log.
6. **The repository is built for several AI sessions at once** (Kyler's decision, feedback item 34; after the
   feedback items): record it in PLAN §20 as the next free D-number; a work board `docs/WORK.md` (claim before
   starting, clear when done; the milestone session stays the one integrator and the only one handing out decision
   numbers); PLAN §20's decisions split one file per decision (`docs/decisions/Dn.md`, with an index), in the same
   pass as item 33's statuses; STATUS split into `docs/status/` per workstream plus a short summary; a hand-back note
   per branch (`docs/handbacks/<branch>.md`); a short guide in every major folder, `docs/ARCHITECTURE.md` and
   `docs/GLOSSARY.md`; the editor's giant files split into feature folders as part of "The page is the editor"; tests
   named as the specification; these habits added to this page's list of what every session and milestone does; noted
   in STATUS and the Progress log.
7. **The forces sitting on the preview** (the session, then `build`, Opus 5.5 high). Three branches feed it:
   - `feature/forces` (#77, `DamGoodMaps-forces`, c90e071b): D309 (details behind More), D312 (size ring, Carve's
     waypoints on the shared gesture piece `src/editor/waypoints.ts`, Erupt final in ~2 s) and Carve's own source as a
     group (D314; Unleash places none) are built and pushed. Its CI on c90e071b was running at the pause.
   - `feature/forces-sounds` (#81, draft, `DamGoodMaps-sounds`, `build-light`, Sonnet 5 high): D313 (Smooth's sound,
     re-encoding, quieter default) and D315 (Delete sources on the Select row) built; CI green on 05ab3afb
     (run 36375584566; the other run on it was a cancelled duplicate); next, merge it into `feature/forces`. Its finding: after Delete sources, CI's headless
     browser sometimes shows a few blueberry bushes gone once the water preview runs on (not in Chrome; the operation is
     exact and tested at the session level): a `build` agent looks at it (water-simulation judgment).
   - `feature/glaciate` (#76, draft, `DamGoodMaps-glaciate`, held for Kyler's sitting): at 8dbecfc (code) / e091e77a
     (progress log): forces merged in (D312 wired on the shared piece), meltwater springs in groups (D314), D309's More.
     Quick suite 820 passed; CI's browser jobs were still running at the pause.
   **Next:** `gh pr checks 76`, `gh pr checks 81`, `gh pr checks 77`; merge `feature/forces-sounds` into
   `feature/forces` (build-light), finish whatever D312/D314 the forces progress doc lists (build), then merge
   `feature/forces` into `feature/glaciate` (build), and deploy the preview from `feature/glaciate`:
   `gh workflow run deploy.yml --ref main -f preview_ref=feature/glaciate`. Tell Kyler (toast + 🔔🔔): his checklist is in
   STATUS ("Your checklist for the forces sitting"). A known snag: when a force sweeps the map's last badwater spring,
   the "No badwater" notice (D213) covers the force rows (Glaciate's hand-back); fix it on `feature/forces` (build).
   **Held for Kyler:** the forces and Glaciate release only after his sitting.
8. **M9b** (`m9b-build`, Opus 5.5 xhigh; `feature/m9b`, #70 draft, `DamGoodMaps-m9b`): source groups wired (284818ad),
   the badwater toggle on a narrow mouth follows D290 (#134; its editor side lands with the forces), badwater ditches
   no longer ruler-straight, the sea's rim wanders. The re-pin is half done: quick suite on d5dd375f 765 passed, 10
   failed (9 map-bound; one resources share at 0.5225 against its line under 0.52: look at it first). The "Handoff"
   section of `docs/progress/m9b.md` has the ten tests, their seeds and the commands. **Next:** merge `origin/dev` (M9a,
   0.7.0, released), re-seed the six seed-bound tests, re-pin the 4242 sha, rerun `npx vitest run --project quick
   --maxWorkers=4`; then samples under D308 and the release candidate: full batches, one pooled probe batch (3D maps, Erode, a Real places sample, M9b maps), then the review set for
   Kyler. **Held for Kyler:** judged by his eye (D252, D273). From Kyler's feedback
   (`docs/feedback/2026-09-28-forces-preview.md`): **21**, generation speed (measure where the time goes at 128² and
   256², fewer failed candidates, the rest in parallel, land first and water filling in, targets set with Kyler from
   the numbers and made part of M9b's acceptance); **22**, the other passing candidates as a strip of thumbnails with
   More (replacing "Another like this"): the generator side here, the strip drawn in "The page is the editor"; **24**,
   trees within walking reach (40 tiles, with their logs), live as the player edits: the number here, its display in
   "The page is the editor" (and in today's editor meanwhile if cheap); **26**, dead trees scattered over dry land
   (find where they come from and report per theme how many at load and where; living trees only where the game's
   soil rules keep them alive; dead trees rare and deliberate; a sample checked in the game with the pooled probe
   batch); **27**, a river whose head is at the map's edge flows into the map, not off it (a natural lip at the
   boundary beside and behind its sources, with the grouped-sources rule, D314; also checked in the Real places
   conversion and wherever a force places sources at an edge; report how many M9a maps lose water off the map at a
   river's head, before and after); **36**, tall maps and the Highest terrain control (check whether Verticality
   100 maps exceed 16; if Highest terrain caps them, it reaches 22 whenever Verticality allows tall maps, with a
   hint on what above 16 means; the two controls never contradict each other; and Verticality 100's choppy one-
   and two-tile blocks and spikes made wild but readable under M9b's chaos rule).
9. **Real places, round 2** (`build`, Opus 5.5 high; then `build-light` for the release; `feature/real-places-2`, #35,
   `DamGoodMaps-places`): **the rebuild is paused** (Kyler, 2026-09-27) until the grouped-sources rule is in its
   conversion (D314). That rule is now wired in (VERSION 11: heads and lake springs as rows, the water floor's spring as
   a group, badwater grouped); the conversion started and stopped at the pause with 37 of 136 places done and cached.
   CI on #35 is red until the rebuild (tests are for the new rules, the gallery still D271's). **Next:** from
   `DamGoodMaps-places`, keep VERSION 11 and run `npx tsx tools/places-convert.ts --threads 3` (about 1.5–3 h for the 99
   left), then build, draw the cards and check it yourself, as the top note of `docs/progress/real-places.md` lists: every place passes the
   blocking list, "No water a pump can reach" is 0, the stripes are gone on 42, 48, 116 and 118. Then release
   `real-places-2-done` (no new sheet for Kyler, D300).
10. **Grouped sources** (D314): the investigation `investigation/source-groups` (#78) is merged into `dev`
   (685d9b18). The rule itself is `feature/source-groups` at a6346fe4 (#79, draft): merge it into `dev` with the first of the branches
   that carry it (M9b, Real places, the forces, Glaciate), not before Kyler's yes on that branch.
11. **Held for Kyler, nothing to do until he answers** (STATUS §1): the water shades (D310, on `feature/high-look` at
   30d7a767; he picks (a), (b) or (c); my pick (a)); the High look (#75, `build`); Drought and Badtide day by day
   (#73, `feature/weather-days`, D307's flooded floor done; `build`, then `build-light` for the fixes from his sitting).
12. **Erode (Codex; #74, `investigation/erode`):** Kyler approved round 2 ("magical, almost perfect") and round 3
   (89305ca6) landed and was approved: its flat-ground wash. Round 4 is with Codex now, narrow: washes across
   uneven ground, and telling a wash sweep from a cliff sweep. **Next:** wait for Codex's round 4; when it lands,
   check the automatic support check passes (0 dropped voxels); then hold #74 for Kyler's look; merge it as an
   investigation on his yes. Adoption into the editor stays at 3D step 3 (after the 3D view), on the forces core
   under the forces' rules (fast by default with Watch, item 29; changing things only when the force reaches
   them, item 30; no refusals; one size ring).
13. **3D terrain, step 1** (`build`; `feature/terrain3d-a`, #71 draft, 24b88b9b): new modules, verified against the game
   (terrain3d-20260927 probe). **Next:** the wiring, after the forces and M9b merge into `dev` (D280).
14. **Then, per ROADMAP.md:** the High look's release right after the forces' (D284), "The page is the editor" (D232–D234,
   D237) — **Kyler's priority (feedback item 23): it follows the forces' release without delay, as one window for the
   generator and the editor. Nothing of it is built until Kyler has held a question-and-answer round on the UI vision
   in the planning chat and approved the written UI brief that comes from it; first, prepare a short document in
   `docs/` of the open design questions and the known constraints (what the page must hold, the decisions recorded
   about it, what the forces sitting and the feedback items changed) and tell Kyler when it's ready. It also draws
   item 22's strip and item 24's number.**, Kyler's editor UI audit and the design pass (D236), the four
   terrain-above-terrain steps (D279–D281), the Weather view (D285), housekeeping (D283 (3); includes the three stale
   capture tools and the held Dependabot majors #24, #25).

**Pending numbers across branches** (renumber at merge): M9b's decisions-pending #134 is its own branch's; the next free
number on `dev` is **#94**. The next decision is **D316**.

## 2. Branches at the pause (2026-09-27, evening)

Worktrees are on this machine (§9), under `C:\Users\krams\code\`. The main clone `DamGoodMaps` is on `dev`. Every one was
clean and matched origin at the pause.

| Work | Branch | PR | Worktree | Last commit | State |
|---|---|---|---|---|---|
| Plans and docs | `dev` | — | `DamGoodMaps` | see `git log` | M9a released; docs current at the pause |
| The forces | `feature/forces` | #77 | `DamGoodMaps-forces` | c90e071b | D309, D312 and Carve's grouped source (D314) built; next in §1 item 7 |
| Sounds and Delete sources | `feature/forces-sounds` | #81 (draft) | `DamGoodMaps-sounds` | 05ab3afb | D313, D315 built; merge into the forces |
| Glaciate's adoption | `feature/glaciate` | #76 (draft) | `DamGoodMaps-glaciate` | e091e77a | preview branch for the forces sitting; held for Kyler |
| M9b | `feature/m9b` | #70 (draft) | `DamGoodMaps-m9b` | 66146f34 | re-pin half done; held for Kyler |
| Real places, round 2 | `feature/real-places-2` | #35 | `DamGoodMaps-places` | cbaf6cf6 | D314 wired (VERSION 11); 37 of 136 converted; resume the conversion (§3) |
| Grouped sources, the rule | `feature/source-groups` | #79 (draft) | `DamGoodMaps-groups` | a6346fe4 | merges with the first branch that carries it |
| Grouped sources, the investigation | `investigation/source-groups` | #78 | `DamGoodMaps-sources` | 1e760899 | merged into `dev` (685d9b18); removable |
| The High look (with D310's shades) | `feature/high-look` | #75 (draft) | `DamGoodMaps-high` | b62188ba | held for Kyler (the shades choice, his look) |
| Drought and Badtide day by day | `feature/weather-days` | #73 (draft) | `DamGoodMaps-weather` | 5bb13406 | held for Kyler's sitting |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 (draft) | `DamGoodMaps-3d` | 24b88b9b | wiring waits for the forces and M9b on `dev` |
| Erode investigation | `investigation/erode` | #74 | `DamGoodMaps-erode` | 89305ca6 | rounds 2 and 3 approved by Kyler; round 4 (washes on uneven ground, wash vs cliff sweep) with Codex; then Kyler's look |
| The ceiling probe (D244 step 1) | `chore/ceiling-probe` | none | `DamGoodMaps-ceiling` | a0be2aaa | done; already in `feature/forces` |
| Kyler's review worktree | `review/m9a-set` | — | `DamGoodMaps-review` | 6575ebc9 | the M9a review set; not written to by agents |

Finished and merged, removable when convenient: `DamGoodMaps-m9a`, `DamGoodMaps-live`, `DamGoodMaps-waterfalls`,
`DamGoodMaps-fixes`, `DamGoodMaps-nightly`, `DamGoodMaps-house` and `DamGoodMaps-carve-check` (detached at 6b9d4e63, which
is on origin).

## 3. Jobs to restart

At the pause no batch, probe run or render was running; the watchers (CI, the #78 merge) ended with the session, and the
keep-awake script is started again (§9). Two jobs to restart:

- **Real places' conversion** (stopped by the pause, 37 of 136 done): from `C:\Users\krams\code\DamGoodMaps-places`,
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
  Drought and Badtide day by day, Erode.
- **Waiting on Kyler:** STATUS §1.

## 6. Open questions

STATUS §1 lists everything waiting for Kyler, with the defaults pending. `docs/decisions-pending.md` holds the defaults
the session chose. **Held Dependabot majors:** #24 (TypeScript 7.0), #25 (@types/node 26), for a quiet housekeeping slot
(D150, D283).

## 7. How things are run here

- **Progress log** (D221): a short, plain comment on [#57](https://github.com/timbermods/dam-good-maps/issues/57) each time
  a step finishes, something is released, a probe batch runs or something is parked for Kyler (what happened, links, what's
  next). `docs/STATUS.md` stays the full record, with its summary at the top.
- **Pings:** when Kyler asks for one, or something waits on him and he may have walked away: `powershell -NoProfile
  -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body "<where>"` (a Windows toast on this
  machine; the PushNotification tool is skipped while he is at the terminal) and a chat line such as "🔔🔔 … 🔔🔔".
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; give each e2e run its own free port),
  `npm run oracle` (the Python validator, 0 disagreements), `npm run batch` (`tools/batch.ts`, ≥ 98% final blocks),
  `npm run places -- --check`. The Claude suite (`npx tsx investigation/claude/bin/reference.ts`, D134) is kept but
  unmaintained and left out of the regular checks while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=feature/glaciate`, then check
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
- **Decisions:** Kyler's decisions go into `PLAN.md` §20 (the next is D316), and into the living docs in the same change
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
  | Building from a written spec: the Drought and Badtide fixes after its sitting, Real places after its D271/D300 fixes (the badwater stage, the release), rendering review sets and contact sheets, mechanical merges and CI fix-ups without real conflicts (judgment on water, generator or forces goes back to `build`) | `build-light` | Sonnet 5, high |
  | Recording decisions, STATUS and the Progress log, consistency sweeps, housekeeping | `routine` | Sonnet 5, medium |
  | The milestone session: orchestrating, merging, releasing, probe batches | (the session) | Opus 5.5, high |
  | (none; M9c removed, D278) | `m9-build` (kept, unused) | Opus 5.5, high |
  | Waiting on CI, batches and probe runs | background scripts that report when they finish, never an agent polling | — |


## 8. Lessons from the last sessions

- Windows with Git Bash: use `MSYS_NO_PATHCONV=1` where paths get mangled; bash heredocs with apostrophes break the tool
  wrapper, so write scripts to files; foreground `sleep` chains are blocked (use background commands or until-loops).
  (The old machine's Store Python couldn't read `%LOCALAPPDATA%\Temp`; this machine's Python can.)
- Off-limits: Kyler's `Documents` folder (it holds secrets; never read it); his saves, settings and mods except through the
  probe runner; `C:\dgm-reference\` (his in-game screenshots: look, never copy, crop or commit); `C:\dgm-workshop\` (other
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
