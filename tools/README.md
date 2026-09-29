# tools

Command-line scripts for generating, checking, measuring and releasing. They run on Node with `npx tsx tools/<name>.ts` (some have an `npm run` alias in `package.json`). Read a script's opening comment for its options.

**Rules**
- Tools use the same core as the site (`src/core/`), so what they measure is what players get.
- Large results (bulk JSON, many files, over a few MB) stay out of git: write to `.scratch/` or `investigation/<name>/local/` (PLAN §20 D195).
- Timings and budgets are printed as information and never fail a build (D115, D145).
- Contact sheets use our own generated maps only (D144); commit one small sheet to `docs/sheets/<step>.png` at each step that changes generated maps.
- Nothing here launches Timberborn.

**Generate and check**
- `gen.ts` (`npm run gen`) makes maps from the command line; `try.ts` (`npm run try`) builds and serves the site locally.
- `check-maps.ts` checks a folder of `.timber` files as a probe batch's maps are checked; `probe-tall.ts` makes the probe's tall test maps; `ingame-files.ts` makes the files for the in-game checks.
- `oracle.ts` (`npm run oracle`) checks generated maps with the Python implementation in `prototype/`.

**Batches and measures**
- `batch.ts`, `batches.ts`: pass rates per theme and size. `settings-suite.ts`, `settings-batch.ts`: each setting's effect on its target.
- `official-baselines.ts`, `straight-reference.ts`, `edge-walls.ts`, `start-spread.ts`, `start-water-fed.ts`: measure the official maps, real channels and generated starts.

**Contact sheets and captures**
- `sheet.ts`, `contact-sheet.ts` with `contact-sheet.py`, `resources-sheet.ts`, `start-sheet.ts`, `waterfall-gallery.ts`: sheets of generated maps.
- `capture-*.ts`: before and after captures for Kyler's look rounds, taken in a real browser.

**Data the game supplies**
- `log-floor.ts` (needs the installed game's blueprints), `export-footprints.ts`, `export-fixtures.py` (the water golden fixtures), `real-places.ts` (`npm run places`).

**Benchmarks and timings**
- `bench.ts`, `bench3d.ts`, `bench-preview.ts`, `bench-brush.ts` (`npm run bench:*`), `timings.ts`, `ci-timings.ts`.

**Release and machine**
- `release.sh` merges a tagged, green `dev` commit into `main` and watches the deploy (CLAUDE.md, "Deploying"); `build-spike.ts`, `spike-check.ts` build and check the delivery spike; `keep-awake.ps1` and `notify.ps1` are for the long sessions on this machine (`docs/HANDOFF.md`).
- `retired-terms.json` lists retired features. `tests/unit/retired-terms.test.ts` fails when one reappears in the living documents or the editor code.

**Tests**: tools have none of their own; the oracle and the batches are the checks they run. `tests/unit/retired-terms.test.ts` covers `retired-terms.json`. Run `npx vitest run tests/unit/retired-terms.test.ts`.
