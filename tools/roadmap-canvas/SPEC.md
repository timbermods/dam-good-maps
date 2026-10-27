# The planning interface

What a project's planning documents must look like for the roadmap canvas to read them. Follow it and the canvas works
unchanged in any public GitHub repository: copy `tools/roadmap-canvas/index.html` in, set its `CONFIG` block (the
project's name, the repository and branch, the paths, the decision prefix, the tag suffix, the labels) and open it.
[CONVERT.md](CONVERT.md) is the prompt that turns an existing plan into this shape.

The shape is the one Dam Good Maps grew into: **the decisions in force**, numbered; **a roadmap** that orders **the
steps** and says what each delivers and what blocks it; **a status page** rewritten at every stop; **a tag per release**;
and **labels** on pull requests and issues for what needs the owner. The canvas never writes; it reads these from the
branch named in `CONFIG` and from GitHub's public API.

## 1. The documents

| File | Required | What it holds |
|---|---|---|
| `ROADMAP.md` | yes | **"The order of work"**, then one `##` section per open step. |
| `docs/STATUS.md` | yes | Where things stand now: released, the sessions, in flight (a table), the release gate, the queue. Rewritten, never appended. |
| `docs/decisions/` or `PLAN.md` | yes | The **decisions in force**: an index and one file per topic, or one section of the plan. |
| `docs/PERFECT.md` | no | The yardstick: what "done well" means, as `##` sections. Shown under the next release. |

Plain Markdown. Links, bold and backticks are stripped on reading. The first paragraph of a section is its summary on
the card. A document that can't be read or no longer has the shape below shows one line on the page saying which.

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

Rules the canvas relies on:

- **Phases** in "The order of work" are bold lines `**N. Title**`. Everything until the next phase is that phase: an
  intro paragraph, then a list. Items are list lines (`-`, `*` or `1.`); nesting is by indentation; a wrapped line is
  indented. An item's **title** is its first bold span (else its text up to the first colon or parenthesis). A paragraph
  after the last phase's list closes the section.
- **Steps** are `##` sections, their `###` sub-steps included. Every `##` section after "The order of work" except "How
  the work is judged" is a card. There is no list of cards to keep: a new section is a new card.
- **A step's name** is its heading's words before any colon, comma or parenthesis (`The page is the editor`, `M9b`,
  `Startup`). The order of work names a step by using all those words in an item's title, a bold span or its lead; a
  heading's decision (`(D371)`) places a step the words don't. STATUS rows name it the same way, or by a pull request or
  branch the section cites.
- **Delivers**, **Blocking**, **Information**: a bold label (`**Delivers**`) followed by a list, or a bulleted label
  (`- Blocking:` or `- **Blocking:**`) followed by nested bullets, or an inline `**Blocking:** text`. **Effort** and
  **In-game check** are inline `**Label:** value`.
- **Decisions** are cited as `D123` (the prefix is configurable). **Pull requests** as `#45`. **Tags** in backticks as
  `` `name-done` `` (the suffix is configurable); a step whose tags all exist is released.
- A step **parked** or **deferred** says so in its heading: `## Real places, second round (parked, D319)`. `## Later`
  and `## Housekeeping` are their own columns.

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

## The release gate         <!-- optional; heading contains "release gate" -->

<what must be true before the next release>
```

Rules:

- A table whose header has a **Work** column is the in-flight table; its **Branch**, **PR** and **State** cells tie rows
  to steps. The **State** cell decides a step's status when its words include `parked`, `merged` (into dev) or neither
  (in flight).
- The sessions section (any heading containing "sessions") has one bullet per session, led by `**The <name> session**`
  and naming its branches and pull requests; the canvas uses it to say which session a pull request is from, after a
  signature line (`— milestone session`) on the item itself.
- "The release gate" (a heading containing "release gate") and the queue (a heading containing "queue") are shown under
  the next release.

### 1.3 The decisions

Either `docs/decisions/README.md`, an index whose `## [Topic](topic.md)` headings link one file per topic, each line
`- D470: a short title`; or one section of `PLAN.md` (`## 20. Editor decisions` here; `CONFIG.paths.planSection`). The
canvas reads the index first and falls back to the plan.

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

- `###` topics, one bullet per decision: `- **D<n>** <text>`. Numbers never move; a decision that is superseded or
  completed leaves for an archive, so "in force" is simply "present here".
- Decisions are the vocabulary: steps, STATUS rows and order items cite them (`D387`), and the canvas shows each cited
  decision's text on hover.

### 1.4 Tags and releases

Every released step has a git tag `<step>-done` (the suffix is configurable) on the commit that shipped it; that
commit's date is the release date. A tag no section cites is a released card of its own.

## 2. Labels and the Coordination issue

- `needs-kyler` (in `CONFIG.labels`): everything waiting on the owner carries it, a pull request or a small issue with the
  question in a few lines, a default chosen without the owner included; it is the only thing the first view lists. Its latest comment is shown, so a report or question goes in a comment (or the issue's text),
  short, ending with a signature line naming the session.
- `approved` and `hold` group the open pull requests; branches starting `investigation/` are investigations.
- The open issue titled "Coordination" (`CONFIG.coordinationTitle`, found by title) holds the messages between sessions;
  its latest five are shown.

## 3. What makes it work well

- **Decisions are numbered once and cited everywhere.** A step, a STATUS row or an order item that cites `D387` lights
  up with that decision's text.
- **ROADMAP's order of work is the single order.** The canvas shows it as written; don't keep a second order anywhere.
- **STATUS is rewritten, never appended.** History goes elsewhere (a Progress log issue).
- **A tag per release.** The release history and dates come from the tags.
- **Headings are stable.** Steps are found by their heading's words; renaming a heading is renaming the step.

## 4. Checking a conversion

Open `index.html`. A good conversion shows no line at the top about a document; every step on the Board in the column
the owner would put it; each phase of the Order of work tied to the cards it names; and decisions' text on hover.
