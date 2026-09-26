# Claude integration groundwork (for M12)

Groundwork for roadmap M12: turning players' requests into bounded operations against the map
engine. Nothing here changes `src/` or `tests/`; it imports them read-only.

- [REPORT.md](REPORT.md): what was built and found.
- [M12-INTEGRATION.md](M12-INTEGRATION.md): how the milestone adopts it. Its section 13 holds
  Kyler's later decisions: Claude steers the generator instead of hand-building features, the
  requests marked "waiting for capability", and keeping the suite green at every step before M12.

## What is here

| Path | What it is |
|---|---|
| `requests.json` | The request corpus: 131 requests in 13 kinds, with their map setups, goals, expectations, feasibility, what the report must say, pass criteria and a reference solution. Written by `bin/corpus.ts`. |
| `lib/flow.ts` | River courses read from the actual flow (water surface, then bed), and the river network (tributaries, lakes). |
| `lib/places.ts` | The place resolver: compass, places relative to features, flow-relative places; phrases or structured places. |
| `lib/words.ts` | The judgement-word table (harsher, lush, dangerous, …) and the size words. |
| `lib/metrics.ts` | Map and feature measures; guards read from the validator. |
| `lib/sites.ts` | `find_sites`: candidates planned by the real builders, checked with a real build, ranked, with the nearest alternative when nothing fits. |
| `lib/steps.ts` | Claude's operation schema (steps) and how each becomes the engine's operations. |
| `lib/compound.ts` | Proposals: ordering, combined checks, interference, guards. |
| `lib/intent.ts` | Intent checks (expectations). |
| `lib/report.ts` | Report templates. |
| `lib/summary.ts`, `lib/tools.ts` | The map summary and the seven tools, with their size limits. |
| `lib/fixtures.ts`, `lib/synthetic.ts` | Map setups: generated maps, drawn rivers, imports; synthetic tilted maps. |
| `bin/reference.ts` | Runs every reference solution through `MapSession` with the real validators. Results in `out/`. |
| `bin/cli.ts` | The in-app Claude's view as a command line (summary and tools only), for the pilot. |
| `bin/add-workshop-requests.ts` | Fills the corpus's workshop slot from a catalogue. |
| `pilot/` | The self-played pilot: `PILOT.md`, the transcripts and each request's call log. |
| `harness/` | The M12 suite runner: Messages API bridge, loop, prompts, grader. Not run here (no key). |
| `tests/` | Vitest tests for the place resolver and the words. |

## Commands

From the repository root:

```
npx tsx investigation/claude/bin/corpus.ts                  # rewrite requests.json
npx tsx investigation/claude/bin/reference.ts               # every reference solution (about 10 min)
npx tsx investigation/claude/bin/reference.ts --only M01    # one request
npx vitest run -c investigation/claude/vitest.config.ts     # resolver and word tests
npx tsc --noEmit -p investigation/claude/tsconfig.json      # typecheck
npx tsx investigation/claude/bin/cli.ts start M01           # play a request through the tools only (then call, summary, end)
npx tsx investigation/claude/harness/run-suite.ts --scripted   # the harness, replaying the references
```

The harness needs its own dependency: `cd investigation/claude/harness && npm install`. With a key,
`npx tsx investigation/claude/harness/run-suite.ts` runs the suite against the Messages API.
