# Handoff: the milestone session

> **Kyler's standing rule, before any task (PLAN §20, D316–D318):** compute is a resource, effort matches the stakes, and
> quality is never compromised. Invest in what compounds; spend little on ceremony; keep reports short. The cheapest model
> and effort that does the job (the models table below), and a real check before any code change is reported done. The full
> rule is at the top of `CLAUDE.md`.

**Read this first if you're the new milestone session.** You start with no memory of the last one. Read `CLAUDE.md`, `docs/STATUS.md`
(in flight, and what waits for Kyler), `docs/PERFECT.md` (the yardstick for every review), `EDITOR_PLAN.md` (before any
editor work), `PLAN.md` §20 (the decisions in force) and the top of `ROADMAP.md` (the order of work). Kyler (he/him) owns the project and decides everything. The earlier handoff:
[archive/handoff-2026-10-01.md](archive/handoff-2026-10-01.md).

## 1. Starting a session

1. Start in the main clone (`C:\Users\krams\code\DamGoodMaps`) at Opus 5.5, high, so `.claude/agents/` load.
2. On a new machine, run once, yourself (safe to run again): `npm run setup:machine` (`tools/setup-machine.mjs`). It creates
   the plan's worktrees and the probe folder `-probe` beside the clone, installs their dependencies, writes the probe allow
   rules into `.claude/settings.local.json`, checks the tools and Timberborn's folders, and prints what's ready and what's
   missing; tell Kyler only what the next task needs. `--dry-run` previews, `--all` adds the parked branches, `--no-install`
   skips `npm ci`. **Restart the session after it adds allow rules.** When a branch starts or is released, update the list at
   the top of the script.
3. Start `tools\keep-awake.ps1 96` in the background, and run `git fetch --all`.

**Tied to a machine, so recreated on a new one:** the probe allow rules (the setup command writes them) and a fresh settings
backup before the first batch; and the local-only data: the decompiled game code (`investigation/decompile_all.sh`), the
official maps (`investigation/extract_builtin_maps.py`), Real places' land cache, and each investigation's gitignored
`local/` folder (its report says how).

## 2. The three sessions (D388, D398)

- **This session** (Opus 5.5, high) does everything except "The page is the editor" and its design: the core, the water,
  the generator, the editor-core items (D387), the Codex adoptions, the Rust order (D381) and the documents. It owns PLAN
  §20's numbering, STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; worktree `-page`, branch `feature/page`, started fresh from `dev`, D395) does only
  the page and its design (D384). It owns the page, the editor's interface, Editor.tsx and its split, and records its decisions in its own `DESIGN.md` and
  `docs/progress/page.md`; this session folds them into PLAN when its work merges.
- **The renderer session** (a separate machine; branch `feature/moving-water`, D398) builds post-release item 3: moving
  water and the Flow view, then renderer R1. This session doesn't build them; it merges #165 once the renderer has merged dev into it, CI is green and
  its 6-cell smoothness check passes on the merged branch (D436), never during a quiet window that measures what it touches.
  The gate is `tools/smooth/` (built from `investigation/performance`, #107): a 6-cell check, Chrome on the discrete GPU at
  256², Standard and High, orbit, brush and force, 3 runs each against dev; a cell fails on a branch median p99 more than 20%
  worse than dev's or more hitches than dev's highest run (D435). Every later force uses it. It runs on Kyler's PC (Opus 5.5, high) and never edits
  PLAN.md, STATUS.md or HANDOFF.md: when its PR merges, this session folds its decisions into PLAN §20, EDITOR_PLAN's view
  section and STATUS. Its plan (Kyler's yes, 2026-10-02) changes `src/worker/session.ts` (WaterView gains an optional
  per-wet-tile current; the Flow view's lanes are built in the worker after a settle) and `src/editor/waterPlayer.ts` /
  `waterJourney.ts`: keep this session's changes there small, and tell Kyler before large ones. The water's bytes, when
  it settles and the pinned digests don't change; High's surface-gradient flow estimate (pending #111) is replaced by the
  simulation's current; the Rust water must keep exposing `out`.
- **Neither touches the other's files.** An item that needs an interface control agrees its place through Kyler
  ([his message](archive/feedback/2026-10-02-two-sessions.md)).

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
and D386's review). **Never raise a model's effort on your own, never start sub-agents at max.** A hand-back from
`build-light` or `build-light-medium` for anything needing judgment goes to `build`.

## 4. The order of work and the Codex adoptions

The order of work (the release gate, the editor-core items, the post-release list, M9b's adoption order) is at the top of
[ROADMAP.md](../ROADMAP.md); Kyler's Codex verdicts and what is still with Codex are in its "The Codex adoptions";
[STATUS.md](STATUS.md) lists the branches and PRs. Codex builds on `investigation/<name>` branches; this session merges them
as investigations at a boundary (a merge commit once green; only Codex's own commits where a branch started from an
unreleased one) and adopts their INTEGRATION.md as proposals; a conflict with a decision becomes a pending decision with a
default. Hold any PR Kyler says Codex is still working on. The Rust adoptions (D442) run ahead of the post-release list as one `build` sub-agent in its own worktree, in parallel with
M9b: (a) Rust 1.90, wasm32 and the Rust build in CI with `portable.rs`; (b) the Rust water, in every engine at every size;
(c) the forces (#158, round 3's corpus with Codex) as soon as it reads ready; (d) the analysis (#157) and the generator after
M9b's release. No speed re-timing gates (D441); Firefox's speed is never measured (D440). Today's merges (#159–#181) are listed in STATUS.

## 5. How things are run here

- **Pings (D332):** the moment Kyler's attention or input is needed (a decision only he can answer, anything ready for his
  eye, an approval, work stuck on his side, anything broken), never for progress, green CI or information. One or two lines
  on what's needed, where, and what carries on meanwhile; never wait silently. The toast: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body
  "<where>"`, a chat line such as "🔔🔔 … 🔔🔔", and one line on #57.
- **CI and docs-only changes:** a change that only touches documents, `LICENSE` or `package.json`'s descriptive fields skips
  the heavy jobs (`tools/ci-changes.mjs`) and finishes in minutes.
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; each e2e run its own free port), `npm run oracle`
  (0 disagreements), `npm run batch` (at least 98% final blocks), `npm run places -- --check`. The Claude suite is
  unmaintained while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=<branch>`, then check
  <https://timbermods.github.io/dam-good-maps/preview/> (noindex). **The `/preview/` slot belongs to the page session while it
  works (D396): ask Kyler before publishing anything else there.** A normal deploy of `main` drops `/preview/`: republish the
  page's preview after every release.
- **Releases** (CLAUDE.md, "Deploying"): `tools/release.sh <tag> <commit> <PR body file> [<preview branch>] [--go]` tags the
  green `dev` commit (annotated), pushes the tag and a `release/<name>` branch, opens the PR into `main`, merges it **as a
  merge commit** once its checks pass, and watches the deploy and `live-check / live` (without `--go` it only checks and
  prints the steps). Then republish the preview and record the release in STATUS and the Progress log. If the live check
  fails, revert the release merge on `main`.
- **Fixes for dev's own failing tests go to dev directly**, never only onto a feature branch.
- **Measuring (D439).** No multi-hour measurement runs (profiling sessions, long timing series, extra quiet windows) unless
  Kyler says one is critical; speed checks take minutes (the 6-cell smoothness check, or a short benchmark of the thing
  changed); correctness and byte-identity checks run in CI or as needed. Tonight's 02:00 window (D414, D434) runs as planned.
- **Probes.** The DGM Probe (`investigation/probe`) is the only way Claude may launch Timberborn, normally only after
  Kyler's yes in chat for that batch (CLAUDE.md, D117). **On this machine D218 lifts the ask:** run a batch whenever the plan
  calls for one and record it in STATUS and on #57 (Steam running, Timberborn closed, the machine quiet).
  Every probe runs from the dedicated worktree `C:\Users\krams\code\DamGoodMaps-probe`, checked out detached at the branch to
  probe (`git checkout --detach origin/<branch>`), with `npm ci` at the root and in `investigation/probe` if the lockfiles
  changed. Build the mod with `run build-mod -- --no-install`; make a settings backup first (`--backup-settings`) and pass it
  as `--reference <backup .reg>`; keep Kyler's installed mods (`--keep-mods`). Print the plan and check it before launching:
  the right maps, the maps written (file, size, sha256), a sensible time, no fallback to a bigger batch. Running without
  `--confirmed-launch` prints the plan and a one-time code; rerun with `--confirmed-launch <code>`. A group whose maps are made outside the repository has its writer in the runner's catalog, and
  `batch -- --group <name>` writes its maps first (`Tall maps` and `Sizes` have one; `Parity` on `feature/parity`; `Terrain
  3D` needs one when it merges; if its run is refused, leave the batch for Kyler).
  Results go to `C:\dgm-probe\`, never Documents. The runner restores his settings, logs and player data, moves what the
  games created out of `Documents\Timberborn`, and stops with exit code 6 if anything new is left (`leftovers.json`).
- **Merging** (D341): nothing merges into `dev` red, ever; a feature branch merges green too, except by Kyler's explicit
  word. No test stays known-flaky: one that passes and fails on the same commit has its cause found and fixed.
- **Findings, decisions, pending defaults:** a finding worth keeping gets a line in [FINDINGS.md](FINDINGS.md) (D316); a
  replaced one moves to the archive's "Stale findings" ([archive/README.md](archive/README.md)). Kyler's decisions
  go into `PLAN.md` §20 (the next is **D444**) and into the living docs in the same change (D188). Defaults chosen while he
  is away go into `docs/decisions-pending.md`, marked as a default the session chose (the next is **#155**; M9b's branch
  holds up to #154, weather-days #120–#125).
- **The review rule:** every review is measured against [PERFECT.md](PERFECT.md) (D225). No blind reviews; Kyler judges visual
  work from before/after captures (with greyscale and colour-blindness sheets).
- **At each milestone and handoff** (D326): copy the month's Progress log (#57) to `docs/archive/progress-log/YYYY-MM.md`;
  keep a rewritten `docs/CHAT-HANDOFF.md`'s previous version as `docs/archive/chats/<date>.md`; add any new major turn to
  `docs/archive/README.md` ("The story"); skim the living docs against what was just built (D188).

## 6. Lessons that still apply

- **Windows with Git Bash:** use `MSYS_NO_PATHCONV=1` where paths get mangled; heredocs with apostrophes break the tool
  wrapper, so write scripts to files; foreground `sleep` chains are blocked (use background commands); start Bash commands
  with `. ~/.bashrc;`.
- **Off-limits:** Kyler's `Documents` folder (it holds secrets; never read it); his saves, settings and mods except through
  the probe runner; `C:\dgm-reference\` (his in-game screenshots: never copy, crop or commit, **except** thirteen of his
  Timberborn screenshots from Steam's screenshot folder for app 1062090, committed downscaled in
  `docs/look/reference/timberborn/` as a visual reference for the look only, never as textures or assets, with one read-only
  copy of his map `pair-map.timber`; nothing else of `Documents` is read); `C:\dgm-workshop\` (other creators' maps and local
  review pages: never commit); the decompiled game code in `investigation/decompiled/` and the official maps in
  `investigation/raw/` (gitignored; for answers only, never copied).
- **Shared machine:** agents stop only processes whose command line names their own worktree; every e2e run needs its own
  free port (Playwright's `reuseExistingServer` once tested another agent's build).
- **Sub-agents:** one Kyler stops can't be resumed: start a new one in the same worktree and tell it the exact state
  (running processes, last commit, what's left). Some hand back before their CI finishes; check the PR yourself.
- **Merges between steps that change generated maps** conflict on the generator version and the pinned seed-4242 sha
  (`tests/contract/look-mine-ruins.test.ts`); re-pin per D148 and bump the version.

## 7. The machine

The computer kept for this work (D218): always on, nobody plays on it. Windows 10 Pro 22H2, Ryzen 5 3600 (12 threads), 32 GB. User folder `C:\Users\krams`; the repository and its worktrees (one per branch, each with its own
`node_modules`: run `npm ci` in one only if its `package-lock.json` changed) are under `C:\Users\krams\code\`.

- **Tools** (per user, no administrator rights; on the user PATH and in `~/.bashrc`): Node 22.23.3; Python 3.12.10 (numpy and
  pillow from `prototype/requirements.txt`); the .NET 8 SDK (`%LOCALAPPDATA%\Microsoft\dotnet`; the machine-wide
  `C:\Program Files\dotnet` has only SDK 3.1); ilspycmd; gh.
- **Timberborn:** Steam at `C:\Program Files (x86)\Steam`; the game version `1.1.2.4-52e959e-sw`, the build the repository
  was verified against (FORMAT.md). Keep Steam running; Timberborn stays closed unless the probe launches it.
- **Official maps** are in `.scratch/official/`, deliberately not in `investigation/raw/builtin/` (its local-only tests also
  expect the workshop copies). **Not on this machine:** `C:\dgm-workshop\` and `C:\dgm-reference\`; work that needs them waits
  for Kyler's main PC.
- **DGM Probe:** results in `C:\dgm-probe\`; settings backup `C:\dgm-probe\settings-backup\2026-09-26T19-19-16\Timberborn-settings.reg`.
- **Restarts** (automatic updates are off): start a session in the repository folder, read this page, start the keep-awake
  script (it ends with the session that started it), check `git worktree list`, and if a probe batch was running, run `npm --prefix investigation/probe run restore`
  before anything else.
- **When the game updates:** recompute the starting-logs floor (D224) with `npx tsx tools/log-floor.ts --check` (then
  `--write`; record the new floor in PLAN §20); regenerate `investigation/decompiled/`; note it in STATUS.
