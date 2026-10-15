# CLAUDE.md

@AGENTS.md

Dam Good Maps: a map generator and editor for Timberborn. This page holds what every task needs. The detail is in
[docs/RULES.md](docs/RULES.md) (coordination, standing rules, writing player text, deploying): read the section your
task touches. [docs/README.md](docs/README.md) maps the documents.

## Start here

- **Decisions (D467):** read [docs/decisions/README.md](docs/decisions/README.md), then
  [how-we-work.md](docs/decisions/how-we-work.md), then only the topic files your task touches.
- **A milestone session** reads [docs/HANDOFF.md](docs/HANDOFF.md) first; [docs/STATUS.md](docs/STATUS.md) says what's in
  flight. **The yardstick for every review** is [docs/PERFECT.md](docs/PERFECT.md) (D225).
- **Before any editor work, read `EDITOR_PLAN.md`;** what its §10 lists as gone must not come back.
- **Coordinate on [#236](https://github.com/timbermods/dam-good-maps/issues/236):** read it when you start, before you
  push and when you finish; each comment starts "To milestone:", "To page:", "To <session name>:".

## The absolutes

- **Plays exactly right, and what you see is what you get** (PERFECT): the water and droughts as the game plays them,
  files the game loads, saved projects reopening byte for byte (D455). Deep verification belongs here and nowhere else.
- **The editor's architecture (D342):** every change to a map is an operation in `ops.schema.json`, refused with a
  one-line reason, never silently clamped; all editing logic lives in `src/core/` and runs headless; `src/editor/` turns
  input into operations and shows results.
- **Tooltips (D351):** every control has a short phrase that tells its purpose, with its shortcut at the end as a key cap;
  no second sentence. Whoever changes a control's behaviour updates its tooltip in the same commit.
- **Docs are part of done (D188):** a change that alters how something works updates its living document in the same PR.
- **Never weaken a test to make it pass.** A test a decision made stale is updated to the decision (D148). No test stays
  known-flaky: find the cause.
- **Timberborn and Kyler's things:** Claude launches the game only through the DGM Probe runner, by the rules in
  docs/RULES.md (D117, D218, D483). Never touch Kyler's installed mods, saves or settings. Secrets are his, set with
  `gh secret set`; never ask for one in chat.
- **Never route around a refusal.** A permission check that says no is surfaced to Kyler, never worked around by another
  tool, another session or a sub-agent.

## How we work (D316, D454, D484, D489)

- **Effort matches the stakes; quality is never compromised.** Invest in what compounds (shared modules, findings worth
  keeping); spend little on ceremony (one-off reports, re-verifying what's verified, measures no decision uses). No
  check, timing or validation unless something is likely to break and Kyler wouldn't see it anyway. Before reporting
  done, run a real check that exercises the change, or say why none can run.
- **Speed is a feature (D453):** anything that feels slow is a bug.
- **Merge fast, test after (D489):** a PR merges once a fresh reviewer agent that didn't write it has approved it and its
  quick checks (typecheck, quick suite, build) are green; the owning session may merge it itself. A review blocks only
  for real bugs. The browser specs and the heavy suites run on dev after the merge, and whoever's merge breaks dev fixes it
  forward at once. Releases to main keep the full gate. Detail: docs/RULES.md, "Merging".
- **Work in parallel:** sub-agents in their own worktrees and branches. Haiku for mechanical work (never wording or
  layout), Sonnet for specified building, Opus for judgment, reviews and new forces; the cheapest model that does the job.
- **Kyler is done testing (D484):** decide against his recorded decisions; only design direction his decisions don't
  settle goes to him, as a `needs-kyler` issue with a recommended default you build on meanwhile.
- **Never idle:** while waiting, keep a watcher on #236 and your PRs running and do other work.
- **Reports are short:** what changed, what falls short, the numbers a decision needs.
- **The rules evolve:** a rule that slows good work, or a better way, is proposed on #236 or to Kyler.
