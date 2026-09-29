# validate

The checks on a map, each with an id, a class and a severity, and the report the page and the tools show (PLAN §11, §19.5).

**Rules**
- Check ids, rules and thresholds match the Python oracle (`prototype/validate.py`, `prototype/playability.py`). `tools/oracle.ts` runs both on the same files and compares every verdict.
- A profile decides what each class does (`report.ts`). What must never fail is correctness and the absolutes (`docs/PERFECT.md`); measures and budgets are information (D115, D145).
- The editor's verdict must equal the generator's on the exported file (`tests/contract/parity.test.ts`).
- Playability runs on the canonically settled water.
- A one-click fix is an ordinary edit operation (`FixOp`).

**Start from**: `checks.ts` `validateMap`, `validateFile`; `playability.ts` (can a colony survive from the start); `report.ts` (`Collector`, `severityOf`, `blocks`).

**Tests**: `tests/contract/validate.test.ts`, `parity.test.ts`, `edges.test.ts`, `sources.test.ts`, `start.test.ts`. Run `npx vitest run tests/contract/validate.test.ts`.
