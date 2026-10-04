# Status

The current state, for <Owner>. Rewritten at every step and stop; no history. The running log is the "Progress log"
issue (#<n>); the decisions are in [PLAN.md](../PLAN.md), "Decisions"; the order of work is the top of
[ROADMAP.md](../ROADMAP.md).

## Released

Latest: `m1-done` (<date>). Every released step's tag: `git tag -l '*-done'`.

## The sessions

- **The main session** (<model>; the main clone) builds <what>.
- **<Another session or agent>** (<model>; worktree `-x`, branch `feature/x`) builds only <what>.

## In flight

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| M2. <Title> | `feature/m2` | #12 draft | `-m2` | <one sentence: where it stands> |
| <Step> | `feature/step` | none | none | Parked by <Owner> (D9) |

## Queued after <event>

1. <what comes next, in order>.

## The release gate (D8)

<What must be true before the next release, and what of it is done.>
