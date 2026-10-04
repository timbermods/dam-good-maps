# Converting a plan to the planning interface

Paste everything below the line into a Claude session in the other repository, with the project's existing plan
(a document, issues, a README section, notes) in the working directory or attached. It produces the documents
[SPEC.md](SPEC.md) describes, sets the canvas's settings, and checks the result. The repository must be public on
GitHub: the canvas reads it from there, without a token.

Before pasting: copy `tools/roadmap-canvas/` from Dam Good Maps into the other repository (the same path is simplest;
any path works), with `SPEC.md`, `CONVERT.md` and `templates/`.

---

You are converting this project's implementation plan into the planning interface that the roadmap canvas reads.
Read `tools/roadmap-canvas/SPEC.md` first; it is the contract. The templates in `tools/roadmap-canvas/templates/`
are the shape to fill. Work on a new branch. Do not change the product's code.

**What to produce**

1. `PLAN.md` (keep the existing plan's substance; if a plan file already exists, keep its name and add the decisions
   section to it, its heading matched by `CONFIG.paths.planSection` in `index.html`):
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
   the State cell in plain words, using `parked`, `merged into dev` or `superseded` where true), and, if there is one,
   `## The release gate`. What waits for the owner is not listed here: see 4.

4. **What waits for the owner:** each question, and each default chosen without the owner, as a small GitHub issue
   with the question in a few lines, labelled `needs-kyler` (the owner's equivalent, named in `CONFIG.labels`); a pull
   request waiting on the owner carries the label itself.

5. `docs/PERFECT.md` (optional but valuable): what done-well means, `##` sections, a short paragraph and a few bullets
   each. Ask the owner for it rather than inventing it; leave it out if they have not said.

6. **Tags:** list the steps already shipped and tag their commits `<step>-done` (annotated, dated by the commit), or
   give the owner the exact `git tag` commands to run if you cannot find the commits.

7. **The canvas's settings:** the `CONFIG` block at the top of `tools/roadmap-canvas/index.html`'s script: the project's
   name, the owner's name, the repository (`owner/name`) and the branch the documents live on, the paths, the
   decisions section's heading, the decision prefix and tag suffix. Create the labels `needs-kyler` (or the owner's
   equivalent, named in `CONFIG.labels`), `approved` and `hold`.

**Rules**

- Every step cites at least one decision; every decision is cited by at least one step, row or order item, or it
  belongs in the archive.
- Short sentences, one idea each, plain words; the first paragraph of a section is what the card shows.
- Never invent progress: a step with no branch, PR or tag is planned. Mark anything you inferred `(recorded at
  conversion)`.
- Headings are stable identifiers: pick them once.

**Check, then report**

Push the branch the canvas reads (or point `CONFIG.branch` at yours) and open `tools/roadmap-canvas/index.html`. Fix every
line it shows at the top about a document. The Board and the Order of work should read as the owner would describe the
project: every step in the right column, each phase tied to the cards it names. Report in a few lines: the steps,
phases and decisions the page shows, the decisions you recorded at conversion for the owner to confirm, and any tag
commands they must run.
