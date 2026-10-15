# AGENTS.md

How work happens in Dam Good Maps, for any agent working in this repository (Codex and other tools load this file;
Claude Code loads it through CLAUDE.md). Kyler Ramsey owns the project. The map of the documents is
[docs/README.md](docs/README.md); the decisions in force are in [docs/decisions/](docs/decisions/README.md).

## Who does what

- **The milestone session** (Claude Code, the dedicated machine): everything except the page — the core, the water, the
  generator, the Rust ports, adopting Codex's investigations, the documents. It owns the decision numbers,
  `docs/STATUS.md` and `docs/HANDOFF.md`.
- **The planning session** (Claude Code, the dedicated machine, worktree `DamGoodMaps-planning`; since 2026-10-14): the
  coordination. It releases to `main`, watches dev's runs after merges and sends each failure to its owner, settles
  cross-session questions on #236, and answers design questions that Kyler's recorded decisions settle, sending only
  the rest to him.
- **The page session** (Claude Code, branch `feature/page`): the page and its design — the editor's interface,
  `Editor.tsx` and its split. Nobody else edits those files.
- **The renderer session** (Claude Code, Kyler's PC): `src/render3d/`, the look and moving water.
- **Other Claude Code sessions** Kyler starts (theme rounds, cleanup): their own branches and PRs.
- **Codex** (Kyler's PC, its own clone): investigations only.

## Branches

- Claude Code sessions open real PRs into `dev`, re-pins included (D148). Never push to `main`.
- Codex works on `investigation/<name>` branches: a report, code, small samples and an adoption patch with an
  `INTEGRATION.md`. Large generated results stay out of git, in `investigation/<name>/local/` or a release (D195).

## Labels and Kyler

- Kyler is done testing and giving feedback (D484, 2026-10-14): Claude completes the project without him. Claude
  sessions review code and judge what players see, hear and feel (in a real browser, with a separate reviewer agent for
  looks, and probe batches for the game).
- `hold`: never merge. `needs-kyler` holds only design-direction questions (one issue each: the question, 2–4 options, a
  recommended default that work proceeds on) and the things only Kyler's account can do. Each session labels its own PRs.
- A PR merges once a fresh reviewer agent that didn't write it has approved it and its quick checks (typecheck, quick
  suite, build) are green; the owning session may merge it itself and posts on #236 what merged (D489, D490); never a PR labelled `hold`. The browser specs
  and the suites run on dev after the merge; whoever's merge broke them fixes it at once. Detail: docs/RULES.md,
  "Merging".
- Sessions talk on the pinned Coordination issue (#236), not through Kyler. Design questions go there to the planning
  session first.

## How to work

- Reports are short: at most about eight lines plus a sheet, capture or link; detail goes in the files.
- No excess checks, timings or validation (D454). Before pushing, run the typecheck and the tests that touch the change;
  CI runs the rest.
