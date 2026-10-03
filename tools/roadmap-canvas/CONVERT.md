# Converting a plan to the planning interface

Paste everything below the line into a Claude session in the other repository, with the project's existing plan
(a document, issues, a README section, notes) in the working directory or attached. It produces the documents
[SPEC.md](SPEC.md) describes and a `manifest.json`, copies the canvas in, and checks the result.

Before pasting: copy `tools/roadmap-canvas/` from Dam Good Maps into the other repository (the same path is simplest;
any path works), delete its `data.js` and `data.json`, and keep `SPEC.md`, `CONVERT.md` and `templates/` with it.

---

You are converting this project's implementation plan into the planning interface that the roadmap canvas reads.
Read `tools/roadmap-canvas/SPEC.md` first; it is the contract. The templates in `tools/roadmap-canvas/templates/`
are the shape to fill. Work on a new branch. Do not change the product's code.

**What to produce**

1. `PLAN.md` (keep the existing plan's substance; if a plan file already exists, keep its name and add the decisions
   section to it, naming its heading in the manifest's `config.sources.decisionsSection`):
   - the product and its principles, as they are;
   - one **decisions section** (`## N. Decisions`): every choice the owner has already made that governs the work,
     numbered `D1`, `D2`, … in the order they were made, grouped under `###` topics, one bullet each
     (`- **D7**: the decision, its reason, and what it amends or supersedes`). Decisions are facts the owner decided,
     not tasks. State the next free number once in the intro: `the next free number (D<n>)`. If the plan records no
     decisions, extract the implicit ones (the stack, the scope cuts, the rules of acceptance, what is out of scope)
     and mark each `(recorded at conversion)` so the owner can confirm or strike it.

2. `ROADMAP.md`: the open work in one order.
   - "## The order of work": phases as `**1. Title**`, each with its items as a list, bold item titles, sub-items
     indented. One order; nothing is ordered anywhere else.
   - One `## <Step>` section per milestone or step, with: a first paragraph that says what it is and cites its
     decisions (`D7`) and PRs (`#12`); `**Delivers**` as a numbered list of outcomes a user would notice;
     `**Acceptance**` with `- Blocking:` (what must hold, or the release does not happen) and `- Information:`
     (measured, never a gate); `**Effort:**` high or xhigh; a tag line `Tag \`<step>-done\``. Parked or deferred steps
     say so in the heading.
   - "## Later" for wanted-but-unscheduled items, one bold-led paragraph each. "## Housekeeping" if there is a
     running list of small things with no gate.
   - Finished steps go to `docs/archive/roadmap.md`, verbatim, under the same headings.

3. `docs/STATUS.md`: where things stand now, rewritten at every stop (no history): `## Released` (the latest tags and
   dates), `## In flight` with the table `| Work | Branch | PR | Worktree | State |` (one row per step being built;
   the State cell in plain words, using `parked`, `merged into dev` or `superseded` where true), `## Waiting for
   <Owner>` as a numbered list, and, if there is one, `## The release gate`.

4. `docs/decisions-pending.md` (optional): defaults chosen without the owner, as the template's table, with
   `The next pending number is #<n>.`

5. `docs/PERFECT.md` (optional but valuable): what done-well means, `##` sections, a short paragraph and a few bullets
   each. Ask the owner for it rather than inventing it; leave it out if they have not said.

6. **Tags:** list the steps already shipped and tag their commits `<step>-done` (annotated, dated by the commit), or
   give the owner the exact `git tag` commands to run if you cannot find the commits.

7. `tools/roadmap-canvas/manifest.json`, from `templates/manifest.json`: `config` (the project's name, the owner's
   name, the paths, the decisions section's heading regex, the Progress log issue number if one exists, the decision
   prefix and tag suffix); 4 to 9 `lanes` that partition the work by area; one card per step or group with `id`,
   `title`, `lane`, `kind`, `tags`, `roadmap` (a regex that matches exactly one heading), `after` (what it follows),
   and, where they exist, `branch`, `prs`, `statusMatch`, `order` keywords, `orderBlock`, `parent`, `status` with a
   `statusNote`. Keep `statusGroups` as in the template. Rewrite `process` in the project's own words: the eight
   nodes (decide, roadmap, sessions, pr, review, tag, release, record) describe how a change travels from the owner's
   decision to a release here; keep the ids.

**Rules**

- Every step cites at least one decision; every decision is cited by at least one step, row or order item, or it
  belongs in the archive.
- Short sentences, one idea each, plain words; the first paragraph of a section is what the card shows.
- Never invent progress: a step with no branch, PR or tag is planned. Mark anything you inferred `(recorded at
  conversion)`.
- Headings are stable identifiers: pick them once.

**Check, then report**

Run `node tools/roadmap-canvas/extract.mjs` (add `--offline` if `gh` is not logged in) and fix every `missing` note
and every ROADMAP section, tag or STATUS row on no card. Open `tools/roadmap-canvas/index.html`: the Board, the Order
of work and the Health view should read as the owner would describe the project. Report in a few lines: the counts the
extractor printed, the decisions you recorded at conversion for the owner to confirm, and any tag commands they must
run.
