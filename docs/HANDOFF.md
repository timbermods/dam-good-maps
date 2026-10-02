# Handoff: the milestone session

> **Kyler's standing rule, before any task (PLAN §20, D316–D318):** compute is a resource, effort matches the stakes, and
> quality is never compromised. Invest in what compounds; spend little on what doesn't (ceremonial reports and captures,
> re-checking by hand); keep cheap automated checks broad; verify deeply only where failure is expensive and hard to see;
> keep reports short. The cheapest model and effort that does the job (§3), and a real check before any code change is
> reported done. The full rule is at the top of `CLAUDE.md`.

**Read this first if you're the new milestone session.** You start with no memory of the last one. Then read `CLAUDE.md`,
`docs/STATUS.md` (what's in flight and what waits for Kyler), `docs/PERFECT.md` (the yardstick for every review),
`EDITOR_PLAN.md` (before any editor work), `PLAN.md` §20 (the decisions in force) and the top of `ROADMAP.md` (the order of
work). Kyler (he/him) owns the project and decides everything. The earlier handoff, with its history, is
[archive/handoff-2026-10-01.md](archive/handoff-2026-10-01.md).

## 1. Starting a session

1. Start in the main clone (`C:\Users\krams\code\DamGoodMaps`) at Opus 5.5, high, so `.claude/agents/` load.
2. On a new machine, run once, yourself (safe to run again): `npm run setup:machine` (`tools/setup-machine.mjs`). It creates
   the plan's worktrees beside the clone and the probe folder `-probe`, installs their dependencies, writes the four probe
   allow rules for this machine's paths into `.claude/settings.local.json` (keeping any there), checks Node, `gh`, the .NET 8
   SDK, Python and Timberborn's folders, and prints what's ready and what's missing; tell Kyler only what the next task
   needs. `--dry-run` previews, `--all` adds the parked branches, `--no-install` skips `npm ci`. **Restart the session after
   it adds allow rules.** When a branch starts or is released, update the list at the top of the script.
3. Start `tools\keep-awake.ps1 96` in the background, and run `git fetch --all`.

**Tied to a machine, so recreated on a new one:**

- **The probe allow rules** (written by the setup command), with `<probe>` the probe folder: `Bash(npm --prefix
  <probe>/investigation/probe run build-mod -- --no-install)`, `... run batch -- --backup-settings)`, `... run batch --
  --group:*)` and `... run restore)`. A new machine needs a fresh settings backup (`batch -- --backup-settings`) before its
  first batch.
- **Local-only data, regenerated when needed:** the decompiled game code (`investigation/decompile_all.sh`), the official
  maps (`investigation/extract_builtin_maps.py`), Real places' land cache, and each investigation's gitignored `local/`
  folder (its report says how). M9b's measures: `investigation/m9b/measure.sh` (`docs/progress/m9b.md`, "Hand-over").

## 2. The two sessions (D388)

- **This session** (Opus 5.5, high) does everything except "The page is the editor" and its design: the core, the water,
  the generator, the editor-core items (D387), the Codex adoptions, the Rust order (D381) and the documents. It owns PLAN
  §20's numbering, STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; worktree and branch `feature/page`) does only the page and its design (D384). It
  owns the page, the editor's interface, Editor.tsx and its split, and records its decisions in its own `DESIGN.md` and
  `docs/progress/page.md`; this session folds them into PLAN when its work merges.
- **Neither touches the other's files.** An item that needs an interface control agrees its place through Kyler.
  Kyler's message: [archive/feedback/2026-10-02-two-sessions.md](archive/feedback/2026-10-02-two-sessions.md).

## 3. Models and agent definitions (D301, amended by D389)

A session loads `.claude/agents/` only at its start, and only in the main clone. Opus where judgment is the product, Sonnet
where the job is written down, scripts where it's only waiting.

| Work | Definition | Model, effort |
|---|---|---|
| M9b (Kyler's setting, D262) | `m9b-build` | Opus 5.5, xhigh |
| Anything touching the water simulation, the generator's processes or the forces; the editor-core items; editor changes; Rust ports; adopting Codex's work | `build` | Opus 5.5, high |
| The document prune; mechanical work touching layout or other work's tests; building from a written spec; review sets and contact sheets; mechanical merges and CI fix-ups without real conflicts | `build-light` | Sonnet 5.5, high |
| Self-contained mechanical work with a clear spec: docs, routine fixes, re-pins, test updates within one area (D341) | `build-light-medium` | Sonnet 5.5, medium |
| Recording decisions, STATUS and the Progress log, consistency sweeps, housekeeping | `routine` | Sonnet 5.5, medium |
| The milestone session: orchestrating, merging, releasing, probe batches | (the session) | Opus 5.5, high |
| The page and its design (D388); the coherence review (D386) | (sessions Kyler starts) | Fable 5.1, high |
| Waiting on CI, batches and probe runs | background scripts that report when done, never an agent polling | none |

`m9a-build` and `m9-build` stay defined, unused. **Never Fable unless Kyler explicitly asks** (he has, for the page session
and D386's review). **Never raise any model's effort on your own, and never start sub-agents at max.** A hand-back from
`build-light` or `build-light-medium` for anything needing judgment goes to `build`.

## 4. The Codex verdicts still to act on

Codex builds on `investigation/<name>` branches (STATUS lists them). This session merges them as investigations at a
boundary, as a merge commit once green (only Codex's own commits where a branch started from an unreleased one), and adopts
their INTEGRATION.md as proposals; anything that conflicts with a decision becomes a pending decision with a default. Hold any
PR Kyler says Codex is still working on.

**2026-10-01**

- **Approved, to merge as investigations:** short join codes (#150; findings into `docs/COLLAB-BRIEF.md`); the performance
  audit (#152; its ranked roadmap guides the speed work); small starts (#153); generation speed (#155: **adopt round 1, then
  round 2**).
- **The smoothness investigation (#107): paused.** Kyler sees no large-brush freeze on his machine, so the stall is most
  likely a measurement artefact under 100% load. Merge it as an investigation, adopt none of its fixes. Its harness is the
  gate that renderer R1 and moving water must pass, in a quiet window.
- **The Rust water port (#156): approved** (D381). Native build for batch jobs now; Rust 1.90, the wasm32 target and the Rust
  build join CI and the setup command. Browser policy: the 2026-10-02 verdict below.
- **Scaling round 4 (#132): approved for adoption.** Adoption checks: a 100-step jump back (1.5–6 s today), memory over a
  long session, native Safari storage.
- **M9b's adoption order** (`feature/m9b`, #70): small starts, then generation speed (round 1, then round 2), then Lake
  Basin round 2 (only after a quiet-machine timing shows it no slower than today), then the settings round 2 last (still
  held: theme-outcome regressions, small lake gains, speed misses); re-measure after each. **M9b must not release slower
  than `dev` at 256²** (D380). Three contract tests already failed on the base: confirm what they are (likely the pending
  re-pins) and fix or re-pin them; none may stay unexplained. First **merge `dev` into `feature/m9b`** and re-measure against
  the committed baseline; fold `resources.mine_reach` into `resources.mine_site`; then the 96² start class, the canyon
  measure's separate effect, the D148 re-pins, the review set for Kyler and one pooled probe batch.

**2026-10-02**

- **Multi-core water (#130): approved.** Threads only where they help: 256² and up in Chromium and Firefox (Firefox always
  measured with its optimizing WebAssembly tier), about 8 threads at 256² and up to 16 at 512²; single-core at 128² and in
  WebKit. Gate: the remaining native `exp` and `hypot` calls made portable first (`investigation/portable-math`, in flight).
  Costs: one first-visit reload (until hosting sends the headers itself; moving to Cloudflare Workers with Static Assets
  becomes worth doing then) and about 35 MiB at 512².
- **The Rust water's Firefox round (#156):** Firefox's slowdown was the test harness (the debugger forced the baseline
  WebAssembly compiler); corrected, a 128² settle went from 1.73 s to 0.16 s, byte-identical. WebKit gains 1.2–1.9× on larger
  maps, while TypeScript still wins small maps there. **Policy:** Rust in Chromium and Firefox once the corrected comparison
  against TypeScript confirms it; Rust in WebKit for larger maps only.
- **The Rust analysis (#157): approved,** byte-identical everywhere; Firefox is being re-measured with the corrected setup.
  The full M9b batch on 16 threads took about 18.5 minutes on a fully loaded machine: compare against the TypeScript batch in
  the quiet measuring window.
- **The Rust forces (#158):** round 1 not adoptable (about 5× slower: a generic serialization layer copied the map across
  the boundary on every call; Carve and Glaciate unported). Round 2 is in flight: the boundary fixed first (the map shared in
  typed memory, one call per operation, never serialized), then Carve and Glaciate, then the full identity gate. **The lesson
  applies to every port.**
- **Still with Codex:** the Rust forces round 2, the Rust analysis's Firefox re-measure, portable maths everywhere
  (`investigation/portable-math`), the dam sketch tool's engine (`investigation/dam-sketch`) and Rust water with threads
  (`investigation/rust-threads`).

**The post-release list, in order** (`build`; to move to the top of ROADMAP, where the order of work lives, and then be
replaced here by a link):

1. The quick-click bug (D378): Craterize clicked quickly sometimes skips the new crater's strike animation; the previous
   force should skip to its end while the new one plays in full. Check every force.
2. Tests for an eruption in High and for the highlight on High's basin sources (D378).
3. Moving water and the Flow view (Codex's flow investigation): always-on moving water in both looks; the Flow view's lanes
   off by default; paths built in the water worker; it must pass the smoothness harness. Then renderer R1 from the
   performance audit (#152): water blending, brush updates, the High look's lighting.
4. Carve's river born as it cuts (D371), Glaciate's Fast timing (D374), startup part 1 (D367); Carve's Maturity (D355) and
   Deposit's adoption (D364) are built directly in Rust after the forces' port (D381).
5. Shift+F resets what F changes on every tool (a force's Size and Power to Auto; a brush's Size and strength to defaults);
   it never starts resizing or triggers Shift's invert.
6. A Strength slider for Smooth and Naturalize in their settings row, moving live with F+scroll and `[ ]`.
7. Trees on soil an edit has dried out get a "dry soil, will die" hint in the readout and with Markers on (D376).
8. After the forces' Rust port: a Sources setting for every force (Ride, the default; Keep; Clear) in More.
9. Check whether the README and the website need a line about the High look.
10. Batch jobs (M9b's measures, theme measures, nightly checks) run independent maps across all CPU threads.
11. One quiet measuring window, once Codex's current tasks land, timing every speed investigation in turn (the faster
    settle, D359, among them).
12. Later: a Codex round on Canyon and Highlands at 96².

## 5. How things are run here

- **Progress log** (D221): a short, plain comment on [#57](https://github.com/timbermods/dam-good-maps/issues/57) each time a
  step finishes, something is released, a probe batch runs or something is parked for Kyler (what happened, links, what's
  next).
- **Pings (D332):** the moment Kyler's attention or input is needed (a decision only he can answer, anything ready for his
  eye, an approval, work stuck on his side, anything broken he sees or plays), never for progress, green CI or information.
  One or two lines on what's needed, where, and what carries on meanwhile; batch non-urgent asks; never wait silently. The
  toast: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body
  "<where>"`, a chat line such as "🔔🔔 … 🔔🔔", and one line on #57.
- **CI and docs-only changes:** a change that only touches documents, `LICENSE` or `package.json`'s descriptive fields skips
  the browser, oracle, generation and engines jobs (`tools/ci-changes.mjs`) and finishes in minutes; anything else runs the
  full suite.
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; each e2e run its own free port; CI runs four
  shards), `npm run oracle` (0 disagreements), `npm run batch` (at least 98% final blocks), `npm run places -- --check`. The
  Claude suite is kept but unmaintained, left out of the regular checks while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=<branch>`, then check
  <https://timbermods.github.io/dam-good-maps/preview/> (noindex). A normal deploy of `main` drops `/preview/`: republish it
  after every release.
- **Releases** (CLAUDE.md, "Deploying"): tag a green `dev` commit (annotated), push the tag and a `release/<name>` branch at
  it, open a PR into `main`, wait for its checks, merge **as a merge commit**, watch the deploy and `live-check / live`,
  republish the preview, record it in STATUS and the Progress log. `tools/release.sh <tag> <commit> <PR body file> [<preview
  branch>] [--go]` does all of it (without `--go` it only checks and prints the steps). If the live check fails, revert the
  release merge on `main`.
- **Fixes for dev's own failing tests go to dev directly**, never only onto a feature branch (Kyler, 2026-09-26).
- **Probes.** The DGM Probe (`investigation/probe`) is the only way Claude may launch Timberborn, normally only after
  Kyler's yes in chat for that batch, every time (CLAUDE.md, D117). **On this machine D218 lifts the ask:** run a batch
  whenever the plan calls for one and record it in STATUS and on #57; the rest applies (Steam running, Timberborn closed, the
  machine quiet). Every probe runs from the dedicated worktree `C:\Users\krams\code\DamGoodMaps-probe`, checked out detached
  at the branch to probe (`git checkout --detach origin/<branch>`), with `npm ci` at the root and in `investigation/probe` if
  the lockfiles changed. Build the mod with `run build-mod -- --no-install`; make a settings backup first
  (`--backup-settings`) and pass it as `--reference <backup .reg>`; keep Kyler's installed mods (`--keep-mods`). Always print
  the plan and check it before launching: the right maps, the maps written (file, size, sha256), a sensible time, no fallback
  to a bigger batch. Running without `--confirmed-launch` prints the plan and a one-time code; rerun with
  `--confirmed-launch <code>`. A group whose maps are made outside the repository has its writer in the runner's catalog, and
  `batch -- --group <name>` writes its maps first (`Tall maps` and `Sizes` have one; `Parity` on `feature/parity`; `Terrain
  3D` (`tools/probe-3d.ts`) needs one when it merges, and until then, if its run is refused, leave the batch for Kyler).
  Results go to `C:\dgm-probe\`, never Documents. The runner restores his settings, logs and player data, moves anything
  the games created out of `Documents\Timberborn`, and stops with exit code 6 if anything new is left (`leftovers.json`).
- **Merging** (D341): nothing merges into `dev` red, ever; a feature branch merges green too, except by Kyler's explicit
  word. No test stays known-flaky: one that passes and fails on the same commit has its cause found and fixed.
- **Findings, decisions, pending defaults:** a finding worth keeping gets a line in [FINDINGS.md](FINDINGS.md) (D316); one a
  later finding replaces moves to the archive's "Stale findings" ([archive/README.md](archive/README.md)). Kyler's decisions
  go into `PLAN.md` §20 (the next is **D398**) and into the living docs in the same change (D188). Defaults chosen while he
  is away go into `docs/decisions-pending.md`, marked as a default the session chose; the next pending number is **#155**
  (M9b's branch holds up to #154, weather-days #120–#125).
- **The review rule:** every review is measured against [PERFECT.md](PERFECT.md) (D225). No blind reviews; Kyler judges visual
  work from before/after captures (with greyscale and colour-blindness sheets). Only breakage, his decided principles and
  what a player feels block (D115, D145).
- **What every milestone and handoff does** (D326): at each month's end, copy the Progress log (#57) to
  `docs/archive/progress-log/YYYY-MM.md`; when `docs/CHAT-HANDOFF.md` is rewritten, keep the previous version as
  `docs/archive/chats/<date>.md`; add any new major turn to `docs/archive/README.md` ("The story"); skim the living docs
  against what was just built (CLAUDE.md, D188).

## 6. Lessons that still apply

- **Windows with Git Bash:** use `MSYS_NO_PATHCONV=1` where paths get mangled; bash heredocs with apostrophes break the tool
  wrapper, so write scripts to files; foreground `sleep` chains are blocked (use background commands or until-loops); start
  Bash commands with `. ~/.bashrc;`.
- **Off-limits:** Kyler's `Documents` folder (it holds secrets; never read it); his saves, settings and mods except through
  the probe runner; `C:\dgm-reference\` (his in-game screenshots: never copy, crop or commit, **except** thirteen of his
  Timberborn screenshots from Steam's screenshot folder for app 1062090, committed downscaled in
  `docs/look/reference/timberborn/` as a visual reference for the look only, never as textures or assets, with one read-only
  copy of his map `pair-map.timber`; nothing else of `Documents` is read); `C:\dgm-workshop\` (other creators' maps and local
  review pages: never commit); the decompiled game code in `investigation/decompiled/` and the official maps in
  `investigation/raw/` (gitignored; for answers only, never copied).
- **Shared machine:** agents stop only processes whose command line names their own worktree (one cleanup once killed
  another agent's batches); every e2e run needs its own free port (Playwright's `reuseExistingServer` once silently tested
  another agent's build).
- **Sub-agents:** if Kyler stops one, it can't be resumed: start a new one in the same worktree and tell it the exact state
  (running processes, last commit, what's left). Some hand back before their CI finishes; check the PR yourself.
- **Merges between steps that change generated maps** conflict on the generator version and the pinned seed-4242 sha
  (`tests/contract/look-mine-ruins.test.ts`); re-pin per D148 and bump the version.
- **Repository size** (D195): investigations commit reports, code, small samples and a few captures; bulk results stay in a
  gitignored `local/` folder or a GitHub Release.
- **Retired terms** (`tools/retired-terms.json`, D188): CI fails if a retired name or retired interface text reappears in the
  living docs or `src/`.

## 7. The machine

The computer kept for this work (Kyler, 2026-09-26; D218): always on, nobody plays on it. Windows 10 Pro 22H2, Ryzen 5 3600
(12 threads), 32 GB. User folder `C:\Users\krams`; the repository and its worktrees (one per branch, each with its own
`node_modules`: run `npm ci` in one only if its `package-lock.json` changed) are under `C:\Users\krams\code\`.

- **Tools** (per user, no administrator rights; on the user PATH and in `~/.bashrc`; no PowerShell profile): Node 22.23.3
  (npm 10.9.9); Python 3.12.10 (numpy and pillow from `prototype/requirements.txt`); the .NET 8 SDK 8.0.425
  (`%LOCALAPPDATA%\Microsoft\dotnet`; the machine-wide `C:\Program Files\dotnet` has only SDK 3.1); ilspycmd 8.2.0.7535; gh
  2.101.0 (logged in).
- **Timberborn:** Steam at `C:\Program Files (x86)\Steam`; the game version `1.1.2.4-52e959e-sw` (Steam build 25096761), the
  build the repository was verified against (FORMAT.md). Keep Steam running; Timberborn stays closed unless the probe
  launches it.
- **Official maps** are in `.scratch/official/` (19 official maps and 3 unnamed ones), deliberately not in
  `investigation/raw/builtin/`: the local-only tests there also expect the workshop copies, which this machine lacks.
  **Not on this machine:** `C:\dgm-workshop\` and `C:\dgm-reference\`; work that needs them waits for Kyler's main PC.
- **DGM Probe:** results in `C:\dgm-probe\`; the settings backup is
  `C:\dgm-probe\settings-backup\2026-09-26T19-19-16\Timberborn-settings.reg`.
- **Staying awake:** the power plan (Ultimate Performance) never sleeps on mains power. While working, run
  `powershell -NoProfile -ExecutionPolicy Bypass -File tools\keep-awake.ps1 96` in the background; it ends with the session
  that started it, so start it again in every session.
- **Restarts:** automatic updates are off by policy; Windows restarts itself after a system crash. After any restart: start a
  session in the repository folder, read this page, start the keep-awake script, check `git worktree list`, and if a probe
  batch was running, run `npm --prefix investigation/probe run restore` before anything else.
- **When the game updates:** recompute the starting-logs floor (D224) with `npx tsx tools/log-floor.ts --check` (then
  `--write`, and record the new floor in PLAN §20); regenerate `investigation/decompiled/`; note it in STATUS.
