# The planning interface

What a project's planning documents must look like for the roadmap canvas to read them. Follow it and the canvas
works unchanged in any repository: copy `tools/roadmap-canvas/` in, write a `manifest.json`, run the extractor.
[CONVERT.md](CONVERT.md) is the prompt that turns an existing plan into this shape.

The shape is the one Dam Good Maps grew into: **a plan** that describes the product and holds **the decisions in
force**, **a roadmap** that orders **the steps** (milestones and smaller steps) and says what each delivers and what
blocks it, **a status page** rewritten at every stop, and **a tag per released step**. The canvas never writes; it only
reads these, plus git and GitHub.

## 1. The documents

Five files, four of them required. Paths are the defaults; `manifest.json`'s `config.sources` can move any of them.

| File | Required | What it holds |
|---|---|---|
| `ROADMAP.md` | yes | The open steps, one `##` section each, and **"The order of work"**. |
| `docs/STATUS.md` | yes | Where things stand now: released, in flight (tables), waiting for the owner, queued. Rewritten, never appended. |
| `PLAN.md` | yes | The product, and one section holding the **decisions in force** (`## 20. Editor decisions` in Dam Good Maps; any heading, named in the config). |
| `docs/decisions-pending.md` | no | Defaults a session chose while the owner was away, until the owner rules on them. |
| `docs/archive/roadmap.md` | no | Finished steps' sections, moved verbatim out of ROADMAP when released. |
| `docs/PERFECT.md` | no | The yardstick: what "done well" means, as `##` sections. Shown in "How it works". |

Plain Markdown. Links, bold and backticks are stripped on reading. Keep one idea per sentence; the first paragraph of a
section is its summary on the card (about 460 characters are shown).

### 1.1 ROADMAP.md

```markdown
# <Project> roadmap

<one paragraph: what this file is, where finished steps went>

## The order of work

<optional intro>

**1. <Phase title>** (<decision refs>)

- **<Item title>**: <what and why, in one or two sentences>
  1. <sub-item>
  2. <sub-item>
- **<Item title>** (#<PR>; D<n>): ...

**2. <Phase title>**

1. **<Item title>** ...
2. **<Item title>** ...

## <Step title>

<first paragraph: the summary; may cite decisions (D123) and PRs (#45); a tag line like "Tag `step-done`">

**Delivers**
1. <outcome a player or user would notice>
2. ...

**Acceptance**
- Blocking: <what must hold>; <...>
- Information: <measured, never a gate>

**In-game check:** <or "none">. **Effort:** <high | xhigh>.

## <Next step title>
...

## Later

**<Item>** (<who asked, when>; D<n>): <one paragraph>.

**<Item>**: ...
```

Rules the extractor relies on:

- **Phases** in "The order of work" are bold lines `**N. Title**`. Everything until the next phase is that phase: an
  intro paragraph, then a list. Items are list lines (`-`, `*` or `1.`); nesting is by indentation; a wrapped line is
  indented. An item's **title** is its first bold span (else its text up to the first colon or parenthesis).
- **Steps** are `##` sections (sub-steps `###`). Anything after "The order of work" that is not "How the work is judged"
  is a step or a group of steps, and the Health view says so if no card covers it.
- **Delivers**, **Blocking**, **Information**: a bold label (`**Delivers**`) followed by a list, or a bulleted label
  (`- Blocking:` or `- **Blocking:**`) followed by nested bullets, or an inline `**Blocking:** text`. **Effort** and
  **In-game check** are inline `**Label:** value`.
- **Decisions** are cited as `D123` (the prefix is configurable). **Pull requests** as `#45`. **Tags** in backticks as
  `` `name-done` `` (the suffix is configurable).
- A step **parked** or **deferred** says so in its heading: `## Real places, second round (parked, D319)`.
- Groups of smaller things ("Later", "Follow-ups") are a `##` section of paragraphs that each start with a bold lead
  (`**A Rift force** (...): ...`) or of bullets; the canvas lists the leads as the group's items.

### 1.2 docs/STATUS.md

```markdown
# Status

<one paragraph: what this is; rewritten at every stop, no history>

## Released

<one paragraph naming the latest tags and dates>

## The sessions            <!-- optional; any heading containing "sessions" -->

- **<Session or agent>** (<model>; <worktree, branch>) does <what>.

## In flight

<paragraphs and bullets about what is happening now>

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| <Step title as a human would say it> | `feature/x` | #70 draft | `-x` | <one sentence: where it stands> |

| PR | Investigation | State |          <!-- optional second kind of table -->
|---|---|---|
| #158 | rust-forces | Draft; approved; ... |

## Queued                   <!-- optional; heading starts with "Queued" -->

1. ...

## Waiting for <Owner>      <!-- heading starts with "Waiting for" -->

1. **<thing>**: <what the owner must do or decide>.

## The release gate         <!-- optional; heading contains "release gate" -->

<what must be true before the next release>
```

Rules:

- A table whose header has a **Work** column is the in-flight table; its **Branch**, **PR** and **State** cells tie
  rows to cards (by branch, by PR number, or by a regex on the Work cell). The **State** cell decides the card's
  status when its words include `parked`, `superseded`, `redundant`, `merged` (into dev), or none of these (in flight).
- A table with an **Investigation** column lists outside work (Codex's, a contractor's) by PR; a card with
  `"statusTable": "Investigation"` shows its rows as items.
- "Waiting for …" is a numbered list; each item's text is shown as is.

### 1.3 The decisions section (PLAN.md)

```markdown
## 20. Editor decisions

<intro paragraph; say where the next free number is: "the next free number (D447; ...)">

### <Topic>

- **D115** (with D112, D145): <the decision, as recorded, one paragraph>.
- **D116**: ...

### <Next topic>
...
```

Rules:

- One `##` section (its heading matched by `config.sources.decisionsSection`, default `^## 20\. `), `###` topics inside,
  one bullet per decision: `- **D<n>** <text>`. Numbers never move; a decision that is superseded or completed leaves
  this section for an archive (so "in force" is simply "present here").
- The next free number appears once as `next free number (D447` or `next is **D447**`.
- Decisions are the vocabulary: steps, STATUS rows and order items cite them (`D387`), and the canvas shows each cited
  decision's text on hover.

### 1.4 docs/decisions-pending.md (optional)

A table with columns `#`, `Milestone`, `Question`, `Default chosen`, `Why`, `Status`; rows whose Status contains
`pending` are open. One line says `The next pending number is #155.`

### 1.5 Tags and releases

Every released step has a lightweight or annotated git tag `<step>-done` (the suffix is configurable) on the commit that
shipped it. The tag's date is the release date. A step that shipped inside another step has no tag; its card says so
(`"status": "released"` with a `statusNote`).

## 2. manifest.json: the cards

The manifest is the only hand-kept file of the canvas. It names the project's lanes and one card per step, and how to
find each card's facts in the documents. Keep it high level: a card per step or group, never per bullet.

```json
{
  "config": {
    "project": { "name": "My Project", "owner": "Kyler" },
    "sources": {
      "roadmap": "ROADMAP.md", "archive": "docs/archive/roadmap.md", "status": "docs/STATUS.md",
      "decisions": "PLAN.md", "decisionsSection": "^## 20\\. ", "decisionsLabel": "PLAN.md §20",
      "pending": "docs/decisions-pending.md", "yardstick": "docs/PERFECT.md", "progressIssue": 57
    },
    "decisionPrefix": "D", "tagSuffix": "-done"
  },
  "lanes": [ { "id": "core", "name": "Core", "color": "#2f8f5b" } ],
  "milestones": [
    { "id": "m1", "title": "M1. ...", "lane": "core", "kind": "milestone", "tags": ["m1-done"], "roadmap": "^M1\\.", "after": [] },
    { "id": "m2", "title": "M2. ...", "lane": "core", "kind": "milestone", "tags": ["m2-done"], "roadmap": "^M2\\.",
      "branch": "feature/m2", "prs": [12], "statusMatch": "^M2\\b", "order": ["m2"], "after": ["m1"] }
  ],
  "statusGroups": [ "...as in templates/manifest.json..." ],
  "process": { "summary": "...", "nodes": [ "...8 nodes, ids decide, roadmap, sessions, pr, review, tag, release, record..." ], "sideFlows": [] }
}
```

Card fields:

| Field | Meaning |
|---|---|
| `id` | Short, stable, used in `after` and in URLs. |
| `title` | As the owner says it. `M9b. Composition and variety` shows as `M9b · Composition and variety`. |
| `lane` | One of `lanes[].id`: the row on the map and the stripe on the card. |
| `kind` | `milestone`, `step`, `group` (a section of smaller things), `gate` (a release gate). |
| `tags` | The tag(s) the step gets; the first is the release tag. Exists → released, with its date. |
| `roadmap` | A regex matched against `##`/`###` headings, live ROADMAP first, then the archive. |
| `orderBlock` | A regex matched against a phase or item title in "The order of work"; its items become the card's items. |
| `order` | Keywords (lowercase substrings) that the order's item titles or bold spans use for this card. |
| `branch`, `prs` | Its branch and its own PRs. GitHub's state of these decides in-flight (open) or built-not-released (merged). |
| `statusMatch` | A regex on the STATUS in-flight table's Work cell. |
| `statusTable` | `"Investigation"`: the rows of that STATUS table become the card's items. |
| `statusSection` | A regex on a STATUS heading whose paragraphs become the card's summary. |
| `after` | The cards this one follows (the map's arrows, "Follows / leads to"). |
| `parent` | A group card this one belongs to. |
| `status`, `statusNote` | A fixed status (`released` without a tag, `in-flight`, `parked`, `deferred`, `later`, `ongoing`) and why. |
| `summary`, `decisions` | Overrides for a card with no section (a summary; decisions it cites). |

**Status, derived in this order:** its release tag exists → **released**; the manifest fixes a status → that; a STATUS
row says parked / superseded / merged / else → **parked** / **parked** / **on-dev** / **in-flight**; its heading says
deferred or parked → **parked**; one of its PRs is open → **in-flight**, merged → **on-dev**; else **planned**.

**Order:** released cards by date; then by their first mention in "The order of work" (phase, then item); children of a
group follow their parent; the rest keep the manifest's order.

## 3. What makes it work well

- **Decisions are numbered once and cited everywhere.** A step, a STATUS row or an order item that cites `D387` lights
  up with that decision's text. Without decisions, the canvas is only a list.
- **ROADMAP's order of work is the single order.** The canvas shows it as written; don't keep a second order anywhere.
- **STATUS is rewritten, never appended.** History goes to the Progress log issue (`config.sources.progressIssue`), one
  comment per finish, release or park; the canvas shows the latest comments.
- **A tag per release.** The release history, dates and "built, not released" all come from `git tag` plus `merged`.
- **Finished steps move to the archive verbatim,** so the released cards keep their text and ROADMAP stays short.
- **Headings are stable.** The manifest finds sections by heading regex; renaming a heading means updating the card's
  `roadmap` (the Health view points at the orphan).

## 4. Checking a conversion

Run `node tools/roadmap-canvas/extract.mjs` and read its output: the counts (cards, tags, phases, STATUS rows, decisions
in force) and the health notes. Then open the Health view. A good conversion has: every ROADMAP section covered by a
card; every tag on a card; every STATUS row on a card; each order phase's items tied to cards; decisions in force above
zero with a next free number; and no `missing` note for a required file.
