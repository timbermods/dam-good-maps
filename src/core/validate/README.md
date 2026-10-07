# validate

The checks on a map, each with an id, a class and a severity, and the report the page and the tools show (PLAN §11, §19.5).

**Rules**
- The checks run in Rust (`rust/checks`, D465): `rust.ts` writes the map into the module's typed buffers and reads back the report and what the checks measured; their TypeScript is tag `ts-checks-final`. A change to a check is a change to `rust/checks` and a re-pin of `tools/rust/checks-pins.json`.
- Check ids, rules and thresholds match the Python oracle (`prototype/validate.py`, `prototype/playability.py`). `tools/oracle.ts` runs both on the same files and compares every verdict.
- A profile decides what each class does (`report.ts`). What must never fail is correctness and the absolutes (`docs/PERFECT.md`); measures and budgets are information (D115, D145).
- The editor's verdict must equal the generator's on the exported file (`tests/contract/parity.test.ts`).
- Playability runs on the canonically settled water.
- A one-click fix is an ordinary edit operation (`FixOp`).
- A map the checks cannot read as the map it claims to be is refused with a one-line reason (D342): `validateMap` throws it.
- A check's message is player text (Kyler, 2026-10-03): the object's name as the game shows it, what is wrong in a few words, its place as "X 105 · Y 7 · Z 11", one line per object, correct plurals; ids and coordinates stay in the check's data. `rust/checks/src/words.rs` writes them; the names are the editor readout's (`describeObject`, generated into the Rust's tables).
- The data the checks share with the rest of the core (`REQUIRED`, `EXTRA_BANDS`, the footprints, the calibrated targets, the names) stays in TypeScript and is generated into `rust/checks/src/tables.rs` (`tools/rust/checks-tables.ts`).

**Start from**: `checks.ts` `validateMap`, `validateFile`; `rust.ts` (the binding); `playability.ts` (what the generator and the editor read the way the checks do: `rulesFor`, `colonyReach`, `mineSitesCutAt`, `basinLeak`, `EXTRA_BANDS`, `nearWater`); `report.ts` (`severityOf`, `blocks`, `failing`, `groupOf`); `facts.ts` `mapFacts` (the map card's key facts, information only). How the editor lists the checks, with their fixes, is `doc/checkItems.ts`.

**Tests**: `tests/contract/validate.test.ts`, `parity.test.ts`, `edges.test.ts`, `sources.test.ts`, `start.test.ts`, `mechanics.test.ts`; `cargo test -p checks` in `rust/`; the byte fixtures in `npx tsx tools/rust/check.ts`. Run `npx vitest run tests/contract/validate.test.ts`.
