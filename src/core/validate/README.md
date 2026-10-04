# validate

The checks on a map, each with an id, a class and a severity, and the report the page and the tools show (PLAN §11, §19.5).

**Rules**
- Check ids, rules and thresholds match the Python oracle (`prototype/validate.py`, `prototype/playability.py`). `tools/oracle.ts` runs both on the same files and compares every verdict.
- A profile decides what each class does (`report.ts`). What must never fail is correctness and the absolutes (`docs/PERFECT.md`); measures and budgets are information (D115, D145).
- The editor's verdict must equal the generator's on the exported file (`tests/contract/parity.test.ts`).
- Playability runs on the canonically settled water.
- A one-click fix is an ordinary edit operation (`FixOp`).
- A check's message is player text (Kyler, 2026-10-03): the object's name as the game shows it, what is wrong in a few words, its place as "X 105 · Y 7 · Z 11", one line per object, correct plurals; ids and coordinates stay in the check's data. `words.ts` has the helpers; the names are the editor readout's (`describeObject`).

**Start from**: `checks.ts` `validateMap`, `validateFile`; `playability.ts` (can a colony survive from the start); `report.ts` (`Collector`, `severityOf`, `blocks`); `facts.ts` `mapFacts` (the map card's key facts, information only). How the editor lists the checks, with their fixes, is `doc/checkItems.ts`.

**Tests**: `tests/contract/validate.test.ts`, `parity.test.ts`, `edges.test.ts`, `sources.test.ts`, `start.test.ts`. Run `npx vitest run tests/contract/validate.test.ts`.
