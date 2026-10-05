# AGENTS.md

How work happens in Dam Good Maps, for any agent working in this repository (Codex and other tools load this file;
Claude Code loads it through CLAUDE.md). Kyler Ramsey owns the project. The map of the documents is
[docs/README.md](docs/README.md); the decisions in force are in [docs/decisions/](docs/decisions/README.md).

## Who does what

- **The milestone session** (Claude Code, the dedicated machine): everything except the page — the core, the water, the
  generator, the Rust ports, adopting Codex's investigations, the documents. It reviews every PR, merges into `dev`
  through the merge queue, releases to `main`, and owns the decision numbers, `docs/STATUS.md` and `docs/HANDOFF.md`.
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

- `hold`: never merge. `needs-kyler`: waits on Kyler; never merge while it's on. `approved`: Kyler approved the
  human-facing result. Each session labels its own PRs.
- Everything that needs Kyler carries `needs-kyler`: the PR, or a small issue with the question in a few lines.
- Kyler never reviews code, only what players see, hear or feel. Claude sessions review code.
- Sessions talk on the pinned Coordination issue (#236), not through Kyler.

## How to work

- Reports are short: at most about eight lines plus a sheet, capture or link; detail goes in the files.
- No excess checks, timings or validation (D454). Before pushing, run the typecheck and the tests that touch the change;
  CI runs the rest.
