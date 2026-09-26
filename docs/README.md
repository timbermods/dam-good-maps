# Documents

Which documents describe the project as it is now, and which are history (Kyler's decision, `PLAN.md` §20
D188).

## Living and authoritative

These are kept current. Any change that alters how something works updates its living document in the same
pull request.

| Document | What it covers |
|---|---|
| [EDITOR_PLAN.md](../EDITOR_PLAN.md) | The editor: its vision first, then the technical reference, then what's superseded. Read it before any editor work. |
| [PLAN.md](../PLAN.md) | The product: the generator, the format, the checks. Its §20 is the decision log (history, below). |
| [ROADMAP.md](../ROADMAP.md) | The steps, in order, with what each delivers and what blocks it. |
| [CLAUDE.md](../CLAUDE.md) | The standing rules for working in this repository. |
| [STATUS.md](STATUS.md) | Where things stand now: what's done, running, and waiting on Kyler. |
| [HANDOFF.md](HANDOFF.md) | The milestone session's handoff: work in flight, the order of work, how things are run here. Read it first when starting a new session. |
| [CHAT-HANDOFF.md](CHAT-HANDOFF.md) | How Kyler and his planning chat (claude.ai) work together. |

## History

These record what happened and why. They stay as written; superseded parts may be marked, never rewritten.

- `PLAN.md` §20, the decision log: every decision, with its date. A later decision can supersede an earlier
  one; both stay.
- [progress/](progress/README.md): one record per milestone or step.
- `investigation/`: the investigations and their reports; their INTEGRATION.md files are proposals.
- [decisions-pending.md](decisions-pending.md): open and decided questions, each with its default.
- [ingame-log.md](ingame-log.md): in-game checks and probe batches.
- [m9-design.md](m9-design.md), [spike-m3.md](spike-m3.md), `map-look/`, `look/`, `sheets/`: step records and
  captures.

## Retired terms

Retired features must not come back. `tools/retired-terms.json` lists their names, and CI flags any that
reappear in the living documents, the interface text or the editor code (`tests/unit/retired-terms.test.ts`,
in the quick suite). Add a term when a feature is retired.

Deliberate mentions are allowed in `PLAN.md` §20, in EDITOR_PLAN.md's "Part 3: superseded", and between
`<!-- retired-terms:allow -->` and `<!-- /retired-terms:allow -->`, as in ROADMAP's "Removed:" list. The
JSON's `pendingRemoval` names the editor files that still hold the old tools until Live editing replaces
them; that list only shrinks.
