# Handoff: the milestone session

> **Kyler's standing rule on checks, above all (D454):** no excessive tests, timings or validation, only when genuinely
> necessary or when Kyler asks; before adding any check, ask whether something is likely to break and Kyler would not see it.
>
> **Kyler's standing rule, before any task (PLAN §20, D316–D318):** compute is a resource, effort matches the stakes, and
> quality is never compromised. Invest in what compounds; spend little on ceremony; keep reports short. The cheapest model
> and effort that does the job (the models table below), and a real check before any code change is reported done. The full
> rule is at the top of `CLAUDE.md`.

**Read this first if you're the new milestone session.** You start with no memory of the last one. Read `CLAUDE.md`, `docs/STATUS.md`
(in flight, and what waits for Kyler), `docs/PERFECT.md` (the yardstick for every review), `EDITOR_PLAN.md` (before any
editor work), `docs/decisions/README.md` (the decisions in force: the index, then `how-we-work.md`, then only the topic files your task touches) and the top of `ROADMAP.md` (the order of work). Kyler (he/him) owns the project and decides everything. The earlier handoff:
[archive/handoff-2026-10-01.md](archive/handoff-2026-10-01.md).

## 1. Starting a session

1. Start in the main clone (`C:\Users\Kyler\code\DamGoodMaps` on Kyler's PC; `C:\Users\krams\code\DamGoodMaps` on the dedicated
   machine) at Opus 5.5, high, so `.claude/agents/` load.
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

## 2. The sessions (D388, D398, D468, D470)

- **This session, the milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the
  water, the generator, the Rust order (D381), the Codex adoptions and the documents. It reviews every PR, merges, releases,
  and owns the decisions' numbering, STATUS and HANDOFF.
- **The page session** (Opus 5.5, high, D468; worktree `-page`, branch `feature/page`, PR #163) does only the page and its
  design (D384). It owns the page, the editor's interface, Editor.tsx and its split, and records its decisions in its own
  `DESIGN.md` and `docs/progress/page.md`; this session folds them into `docs/decisions/` when its work merges.
- **The renderer session "forces play"** (Kyler's PC, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play (#311) and owns `src/render3d/`. Its PRs merge on green CI (D453) once Kyler has played them. The old
  renderer session is closed; its #275 and #225 have no owner until Kyler says (STATUS).
- **Codex** runs on both machines, each task in its own clone, never in a session's worktree. It delivers investigations
  with an adoption patch split by owner (page, milestone, renderer) and an eight-line report; Kyler decides each adoption.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session, the analysis session) open real PRs into
  `dev`; this session reviews and merges them.
- **No session touches another's files.** Sessions talk on the Coordination issue (#236); what needs Kyler carries
  `needs-kyler` (D470).

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
(c) the forces (#158) as soon as CI's byte-identity checks and the suites pass against the Rust (D453); (d) the analysis (#157) and the generator after
M9b's release. No timing gates (D441, D453); Firefox's speed is never measured (D440). Today's merges (#159–#181) are listed in STATUS.

## 5. How things are run here

- **Coordination (D470):** only what needs Kyler reaches him.
  - *Review:* Kyler reviews no PR or code, except for design, taste or human-facing behaviour. This session reviews every
    PR's diff before it merges (correctness, scope, ownership of files); its own PRs that touch the core or the water get a
    review from a fresh sub-agent that didn't write them.
  - *Merging:* labels `hold` (never merge), `needs-kyler` (waiting on his eye; never merge while on) and `approved` (he
    approved the human-facing result); each session sets them on its own PRs. This session merges, through the merge queue,
    any green PR that isn't hold or needs-kyler. A PR that changes what a player sees, hears or feels (a theme, a force, the
    page, sound, wording) needs approved; one with nothing human-facing (internals, CI, Rust ports, cleanup, docs,
    investigations) merges on review and green CI.
  - *At every merge pass:* anything that no longer needs Kyler loses `needs-kyler`; a PR this session adopts or supersedes
    is closed with a line saying why; an answered question's issue is closed.
  - *A Codex PR Kyler sends back for another round* loses `needs-kyler` until Codex pushes that round; then it gets the
    label again for his verdict.
  - *Theme rounds* by Claude Code sessions land as real PRs into dev, re-pin included (D148), not as investigations; if two
    collide on pins, this session re-pins the later one. Codex stays on investigation branches, adopted on Kyler's yes; read
    its branches, it doesn't use the issue.
  - *The Coordination issue* ([#236](https://github.com/timbermods/dam-good-maps/issues/236), pinned): messages between Claude Code
    sessions, each comment starting "To milestone:", "To page:", "To renderer:" or "To <session name>:". Read it at the start of
    a task, before pushing and at the end; answer there.
  - *The line.* Settled between sessions: merge order, holds, rebases, re-pins, CI failures (whoever's change broke it
    fixes it), a core function another session needs that changes nothing a player sees or hears, ordering on overlapping
    files within the ownership rules, merging investigations. Kyler only: anything a player sees, hears or feels; a new
    direction or scope; a decision that constrains future work; adopting a Codex investigation; releases; probe batches
    (D117); starting a session or anything that spends usage; a disagreement sessions can't settle; anything a session is
    unsure about. Those get `needs-kyler` and a ping. Everything that needs Kyler carries `needs-kyler` on GitHub, so one
    list shows it all: with a PR, the PR gets the label; without one (a question, a trade, a probe batch request, a sitting),
    the session opens a small issue, its question in a few lines, labelled `needs-kyler`, and closes it once Kyler has
    answered; the milestone session labels a Codex investigation PR `needs-kyler` when it's ready for his adoption verdict.
  - *Reports* are at most about eight lines (what changed, what's still wrong, the numbers a decision needs) plus the sheet,
    capture or link; detail goes in the files. Post the same report on the PR (or the Coordination issue if there's no PR)
    and in chat.
- **Pings (D332):** the moment Kyler's attention or input is needed (a decision only he can answer, anything ready for his
  eye, an approval, work stuck on his side, anything broken), never for progress, green CI or information. One or two lines
  on what's needed, where, and what carries on meanwhile; never wait silently. The toast: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body
  "<where>"`, a chat line such as "🔔🔔 … 🔔🔔", and one line on #57. If `%USERPROFILE%\.dgm-ntfy-topic` exists the script also posts to ntfy, so it reaches his phone; never print, log or commit the topic.
  **The `needs-kyler` label is itself a ping:** labelling an issue or PR sends one ntfy notification from GitHub
  (`.github/workflows/needs-kyler-ping.yml`, the `NTFY_TOPIC` secret Kyler sets), its number and title, its link as the click target.
- **When CI runs:**
  - a **pull request into `dev`** runs the light set: `test` (typecheck, quick suite, build) and the four browser shards. Not
    while it is a draft; a newer push cancels the run it supersedes;
  - the **merge queue** (a merge group) runs the full suite on the merged state, once per batch: oracle, generation, engines and rust as
    well. Nothing merges into `dev` without it. `dev` has no CI of its own on a push; the nightly checks its tip;
  - a **push to `main`, a pull request into `main` (a release) and a manual run** run the full suite, never cancelled;
  - the rest is skipped by what changed (`tools/ci-changes.mjs`): only documents, `investigation/`, `LICENSE` or `package.json`'s
    descriptive fields run just the document tests and the build (a pull request into dev touching only `investigation/`
    runs nothing beyond `changes`); only `src/editor/`, `src/ui/` and `tests/e2e/` skip oracle,
    generation, engines and rust; the Rust checks run only when `rust/`, `tools/rust/`, the Wasm's TypeScript wrapper or the
    workflow changes. CodeQL runs on pushes and weekly, not on PRs.
- **Merging into `dev`** goes through the queue: open the PR ready, wait for the light set to go green, then add it to the
  merge queue (`gh pr merge <n> --merge --auto`, or the button). The queue's run must pass; a red run drops the PR out. A fix for dev's own failure
  is still a PR through the queue.
- **Before pushing:** run the typecheck and the tests that touch the change; CI runs the rest (D454).
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; each e2e run its own free port), `npm run oracle`
  (0 disagreements), `npm run batch` (at least 98% final blocks), `npm run places -- --check`. The Claude suite is
  unmaintained while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=<branch>`, then check
  <https://timbermods.github.io/dam-good-maps/preview/> (noindex). **The `/preview/` slot belongs to the page session while it
  works (D396): ask Kyler before publishing anything else there.** A normal deploy of `main` drops `/preview/`: republish the
  page's preview after every release.
- **The roadmap canvas** is at <https://timbermods.github.io/dam-good-maps/roadmap/> (noindex), taken from dev by every deploy;
  `roadmap-sync.yml` runs a deploy when dev's copy changes and republishes the live preview commit (`/preview/ref.txt`).
- **Releases** (CLAUDE.md, "Deploying"): `tools/release.sh <tag> <commit> <PR body file> [<preview branch>] [--go]` releases a
  `dev` commit that the queue's run passed (a commit with no run is refused): pushes a `release/<name>` branch, opens the PR into `main` (its run is the full CI; a
  cancelled run on the commit counts as no result), then tags the commit (annotated) and merges the PR **as a merge commit**
  once its checks pass, and watches the deploy and `live-check / live` (without `--go` it only checks and
  prints the steps). Then republish the preview and record the release in STATUS and the Progress log. If the live check
  fails, revert the release merge on `main`.
- **Fixes for dev's own failing tests go to dev**, never only onto a feature branch: as a PR through the queue (a repository admin's direct push bypasses it, and has no CI run, so release only commits that went through the queue).
- **Speed (D453).** No quiet windows, measured budgets or timing gates; Kyler judges speed by using the tool. Correctness and
  byte-identity checks run in CI; a real check before anything is reported done stays.
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
  go into their topic file in `docs/decisions/`, with a line in its index (the next is **D476**; a number only for a rule that constrains future work, D470; model choices, who does what and Kyler's verdict on a round go in STATUS or the Progress log, unnumbered) and into the living docs in the same change (D188). Defaults chosen while he
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

**Kyler's PC (since 2026-10-05):** Ryzen 7 9800X3D (16 threads), RTX 4080; Node 24, Rust 1.90 with wasm32, .NET 8,
Python 3.13, gh. Under `C:\Users\Kyler\code`:

- `DamGoodMaps`: the main clone, where the milestone session runs;
- `DamGoodMaps-page`: the page session's worktree, on `feature/page`;
- `DamGoodMaps-probe`: the probe folder, detached;
- `DamGoodMaps-forces-play`: the renderer session's worktree;
- about 50 older `DamGoodMaps-*` worktrees from released work: leave them alone.

Codex works in `C:\Users\Kyler\Documents\ChatGPT`. Every folder that isn't the milestone session's belongs to another
session or to Codex: never touch it, and check no session is working in a folder before installing or checking out there.
The renderer session shares the PC and comes first: keep local runs to about half the threads and leave the rest to CI.
**Probe batches need Kyler's yes in chat, every time** (D117; D218 lifts the ask only on the dedicated machine).

**On any new computer:** clone the repository, run `npm run setup:machine` (it installs the dependencies, makes the page
worktree, writes the probe allow rules into `.claude/settings.local.json` and checks the tools; restart the session after it
adds allow rules), install Rust 1.90 with the `wasm32-unknown-unknown` target, and `gh auth login`. The section below
describes the dedicated machine.

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
  `--write`; record the new floor in `docs/decisions/`); regenerate `investigation/decompiled/`; note it in STATUS.
