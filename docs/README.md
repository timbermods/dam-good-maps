# Documents

Which documents describe the project as it is now, and which are history (Kyler's decisions, `PLAN.md` §20 D188 and
D390). The test for every document, section and rule: does it change what gets built, or how? If not, it goes to the
archive.

## Living

Kept current: any change that alters how something works updates its living document in the same pull request. They say
how things are and what is next, not how they got there.

| Document | What it covers, and when to read it |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | The standing rules for working in this repository. Every session reads it first. |
| [HANDOFF.md](HANDOFF.md) | The milestone session's handoff: how to start, the two sessions, the models, how things are run, the lessons, the machine. Read it first when starting a session. |
| [STATUS.md](STATUS.md) | Where things stand now: what's released, what's in flight (branches, PRs, worktrees, owning session) and what waits for Kyler. |
| [CHAT-HANDOFF.md](CHAT-HANDOFF.md) | How Kyler and his planning chat (claude.ai) work together. Read it when starting a planning chat. |
| [PERFECT.md](PERFECT.md) | What perfect means: Kyler's yardstick for every piece of work and every review (D225). |
| [ROADMAP.md](../ROADMAP.md) | The order of work (the release gate, the post-release list), the Codex adoptions with Kyler's verdicts, then each open step with what it delivers and what blocks it. |
| [PLAN.md](../PLAN.md) | The product: the generator, the checks, the interface. Its §20 holds the decisions in force. |
| [EDITOR_PLAN.md](../EDITOR_PLAN.md) | The editor: its vision first, then the technical reference, then what's gone and must not come back. Read it before any editor work. |
| [FORMAT.md](../FORMAT.md) | The Timberborn map format as the repository verified it. |
| [README.md](../README.md) | The player-facing text (written by CLAUDE.md's rules for README and website text). |
| [UI-BRIEF.md](UI-BRIEF.md) | Kyler's UI brief for "The page is the editor": what gets built (D330). |
| [COLLAB-BRIEF.md](COLLAB-BRIEF.md) | Kyler's collaborative editing brief: what gets built at that milestone (D362). |
| [FINDINGS.md](FINDINGS.md) | The findings later work builds on, one line each with its number and where it is measured: the game's rules, the official maps, the probe's confirmed behaviours, measured performance. |
| [GLOSSARY.md](GLOSSARY.md) | The shared terms (force, working area, candidate, the absolutes and the rest), each defined once with the decision that set it. |
| [decisions-pending.md](decisions-pending.md) | The open pending defaults only: choices the session made while Kyler was away, with the next pending number. |
| Folder READMEs | Each `src/core/` folder, `tools/` and `prototype/` has a short README: its purpose, rules, entry points and tests. Keep it current when the folder's rules or entry points change. |
| `.claude/agents/` | The agent definitions (`build`, `build-light`, `build-light-medium`, `routine`, `m9b-build` and two kept, unused); HANDOFF's models table says which work goes to which. |

## Investigations

[investigation/README.md](../investigation/README.md) is the one index of the investigations: what each found and whether
it was adopted. `investigation/` is their archive in place (code under `src/` and `tools/` names its folders); an
investigation's INTEGRATION.md is a proposal.

## The archive

[archive/README.md](archive/README.md) is the index of `docs/archive/`: the decision table as it stood at D390, the parts
of PLAN, EDITOR_PLAN and ROADMAP that were superseded or finished, the earlier STATUS and HANDOFF, the finished progress
logs, the Progress log's monthly copies, the old chat handoffs, Kyler's feedback files, the answered pending decisions, the
stale findings, and the story of the project. Archived files stay as written; superseded living text moves there
verbatim, never rewritten.

## Capture folders

Images and capture folders stay where the tools in `tools/` write them: `docs/progress/<name>/` (forces, glaciate,
live-editing; in-flight steps keep their log at `docs/progress/<step>.md`), `docs/look/`, `docs/map-look/` and
`docs/sheets/` (one contact sheet per map-changing step). Archived Markdown links to them by relative path.

## Retired terms

Retired features must not come back. `tools/retired-terms.json` lists their names, and CI flags any that reappear in the
living documents it names, the interface text or the editor code (`tests/unit/retired-terms.test.ts`, in the quick
suite). Add a term when a feature is retired.

Deliberate mentions are allowed in `PLAN.md` §20, in EDITOR_PLAN.md's "# Part 3: superseded" pointer (the test relies on
that heading; §10 above it, "What's gone, and must not come back", is the short list), and between
`<!-- retired-terms:allow -->` and `<!-- /retired-terms:allow -->`, as in ROADMAP's "Removed:" list. The JSON's
`pendingRemoval` names the editor files that still hold the old tools until Live editing replaces them; that list only
shrinks.
