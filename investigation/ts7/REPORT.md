# TypeScript 7 / Node 26 adoption (D460)

**Outcome: preparation fixes are ready; adoption is blocked by the recorded heavy-suite failures and
unverified browser/host gates. This is not a green D460 approval.**

Investigation base: `dev` at `c896e83c092960c4ddb5939207e1d99863a19ac8`.
Page applicability base: `feature/page` at `beee673e2dc3fb75d04277f0baf47755deb9fae9`.
Later applicability checks also pass at dev `6e4058f38e359b396969be64a5c975ed12f425f5`
and page `407e096aca39427707e9eef7dbcaee280886dfc1`. Those later commits are not the validation base:
dev now has the owners' Delta-arms/poisoned-river changes and generator version 0.8.2.
That later dev snapshot also passes upgraded clean installation, TS7 typecheck, production build and the
10 portable-guard tests. The full suite results below remain from the recorded 0.8.1 validation base.
Publication base: dev `7cc59f672a203611de72e8b43cf31da4fc6bdb18`; final page applicability tip:
`826919d055792372f759bda9bf821b7fe859a451`. Both patches still apply, and this final dev snapshot also
passes the upgraded typecheck, build and 10 guard tests. This report-only branch follows that dev tip.
Validation uses Node 22.23.3, TypeScript **7.0.2**, and `@types/node` **26.6.2** together.
Only this directory is committed; product changes are supplied as owner-specific adoption patches.

## Causes and changes

### TS7 inference diagnostics: six numeric declarations

TS7 reported TS7022 for four loop coordinates and two prototype shore coordinates. Explicit `number`
annotations preserve the existing arithmetic and resolve the diagnostics without assertions or suppressions.
The affected files are:

- Milestone: `src/core/features/raster/brush.ts`, `remoteStroke.ts`, `terrain.ts`, and
  `investigation/generative/proto/generate.ts` (the prototype is reached transitively by typecheck).
- Page: `src/editor/brushes.ts` only. There is no style change.

All five files emit identical JavaScript before and after the annotations, checked with the same parser/compiler
API. No pin, fixture, schema, generator behavior, map bytes, interface wording, or compiler option is changed.

### TS7 removes the old compiler API

`tools/portable-guard.ts` used `typescript.createSourceFile` and the TypeScript AST visitor API. TS7's root
export contains version information instead; the original import produced TS2339/TS2694 diagnostics and would
break the quick suite's source guard at runtime.

The milestone patch adds Microsoft's `@typescript/typescript6` **6.0.2** compatibility package, with its
`@typescript/old` API locked to **6.0.3**, and points only the guard at it. The visitor and its scope are unchanged.
This follows Microsoft's [side-by-side API guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).
TS7 remains the repository compiler. The guard's 10 tests, including its planted bypass cases, pass.

The compatibility dependency also provides a `tsc` executable through its transitive package. To prevent npm's
bin linking from silently selecting TS6, `npm run typecheck` invokes `node node_modules/typescript/bin/tsc`
explicitly. Its version was checked as **7.0.2**. There is no `tsconfig.json` change or loosened option.

### Node 26 types

No source fix was required specifically for `@types/node` 26.6.2. It is tested together with TS7, while the
runtime remains Node 22 as in CI. The preparation patch deliberately keeps both current major-version ranges:
the version changes remain the responsibility of #24 and #25, after the preparation patches are adopted.

### Fixed property seed lacks the water-tool preconditions

The heavy property's fixed 96² River Valley seed 306 no longer produces an accepted Fill or Remove unfed
water in its random draws and coverage sweeps. This reproduces on untouched dev and on the later 0.8.2
snapshot. The milestone patch repairs the test setup in `tests/contract/properties.test.ts`:
when those operations remain uncovered, existing Sculpt operations make a source-free dry plateau and an
8×8 pit, following the water-edit contracts' setup. The real `planFill` and `unfedWater` questions then
provide the operations. New assertions require the Fill and removal to apply and the removal to include
the filled tile. All setup/tool steps use the existing incremental/full-build, undo/redo, export/project
round-trip and final undo-to-original-byte checks.

`SEED_FOR`, `OPS`, `LOG_OPS`, the original draws and sweep, all existing assertions, and every pin remain
unchanged. Setup steps are excluded from the original accepted-draw minimum, so they cannot mask a failure
of that requirement. The final 96² case passes on both snapshots. The unchanged 128²/192²/256² branches
passed in the four-preset focused run; they already cover both tools and leave this setup inactive.
Evidence: `properties-repair.log` for those three passes, `properties-final-small.log` and
`latest-properties-final-small.log` for the repaired case, and `typecheck-final-coverage.log`.

## Verification

All upgrade checks below use both majors together; the separately marked baseline/preparation controls use
their recorded old majors. Vitest uses at most four workers, Cargo at most four jobs/test threads,
Playwright one worker, and the numerical batch/oracle workers one. Batch themes and determinism engines
run serially. The dedicated four-thread Rust water checks ran separately; threaded determinism follows
the other local jobs.
Raw logs remain in gitignored `local/`; no benchmark or additional speed comparison is run. Existing
test-runner progress includes its normal elapsed-time display; those numbers are not adoption evidence.

| Check | Result | Local evidence |
| --- | --- | --- |
| Clean upgraded `npm ci` | Pass | `npm-ci-upgraded.log` |
| Preparation patches, before the majors | Final patched install/typecheck pass on TS5.9; guard's 10 tests pass | `final-preparation-npm-ci.log`, `final-preparation-typecheck.log`, `preparation-portable.log` |
| Explicit TS7 version and typecheck | 7.0.2; pass | `typecheck-clean.log` |
| Quick suite / existing source guards | 251 files passed, 1 skipped; 1,639 tests passed, 4 expected failures, 14 skipped | `test-quick.log` |
| Initial heavy project | 14 failed, 78 passed, 4 expected failures; baseline controls reproduce all cause groups | `test-heavy.log`, `baseline-heavy-control.log` |
| Repaired property coverage | 96² passes on both bases with unchanged initial/final bytes; other three unaffected presets pass | `properties-final-small.log`, `latest-properties-final-small.log`, `properties-repair.log` |
| Production build | Pass; existing chunk-size warning | `build-production.log` |
| E2e-mode and public e2e builds | Both pass | `build-e2e.log`, `build-public-e2e.log` |
| Fresh Rust Wasm and native binaries | All four embedded modules match; all four native binaries build | `rust-build.log` |
| Rust water/analysis/checks contracts | 23 unit tests and 1 doc test pass | `rust-contracts.log` |
| Stacked-water goldens | All 8 exact natively and in Node-Wasm; both slice-boundary checks pass | `rust-stack-identity.log` |
| Native/Node/app water identity, 1/4 threads, 96–512² | All 70 canonical settles produce identical bytes | `rust-water-identity.log` |
| Rust maths/port identity | Source, IR, assembly and Wasm guards pass; native, Node and Chrome identities pass | `rust-check.log` |
| Determinism smoke, Chrome/Node/Chrome four-thread water | 195 cases, 666 checkpoints each; no mismatches or errors | `determinism-smoke-*.log` |
| Determinism full, same three engines | 370 cases, 1,814 checkpoints each; no mismatches or errors | `determinism-full-*.log` |
| Browser specifications, installed Chrome | 124 passed, 4 existing skips; no unexpected failures | `e2e-chrome.log` |
| Nightly oracle (includes all CI seeds) | 63 maps pass load and byte round-trip; 22 parity cases, 1,122 comparisons, zero disagreements | `oracle-nightly.log` |
| Nightly generation batches (includes each CI 20-seed prefix) | Every theme 100/100 accepted; all 700 project files reopen to identical bytes | `batch-*.log`, `batch-checks.json` |
| Later dev 6e4058f3, both majors + patches | Clean install, TS7 typecheck, build and 10 guard tests pass | `latest-npm-ci.log`, `latest-typecheck.log`, `latest-build.log`, `latest-portable.log` |
| Publication dev 7cc59f67, both majors + patches | TS7 typecheck, build and 10 guard tests pass | `publication-typecheck.log`, `publication-build.log`, `publication-portable.log` |

The initial heavy project completed: **14 failed, 78 passed, 4 expected failures; 5 files failed, 2 passed**.
The property failure is repaired above. The other thirteen failures on that base are unaffected by this
patch. The complete heavy project was not repeated after the focused property repair; it is not a green
nightly. Later-dev controls below distinguish already-resolved behavior from remaining functional blockers.

### Heavy-suite blockers at the validation base

- **Coverage preconditions:** `properties.test.ts`, small 96² River Valley seed 306, never applies
  `fillHollow` or `removeUnfedWater`. Its incremental/full-build comparisons pass until the required operation
  coverage assertion. `randomOps.ts` requires a real dry hollow and then removable unfed water; the fixed draw
  no longer reaches both. This is now repaired by the test preconditions above, preserving the seed and assertion.
- **Object preservation:** `editSequences.heavy.test.ts`, Delta 96² seed 2, reports three sequences adding
  WaterSource IDs at `(44,47)`, `(45,47)`, `(46,47)` during Quake lift or Craterize. This is the reopened
  project's object-preservation contract, not a compiler diagnostic. Its allowed-source exceptions remain
  limited to Carve river and Glaciate meltwater.
- **Functional settings:** `settings.test.ts` Drought reserve moves its stored-water mean from 439 to 578,
  an improvement of 139 against its existing minimum of 200. The threshold remains intact.
- **No accepted map:** eleven `everySetting` cases fail their unchanged checks: all-maximums Any 48×48 Easy
  seeds 101/1/2/3; starved-start Highlands 48×48 Hard seeds 101/1/2/3; starved-start Delta 96×96 Hard
  seeds 102/1; and starved-start Any 192×192 Hard seed 104.
  Most end without a start or enough mines; Highlands seed 101/2 also lacks badwater, and Any seed 1 violates
  its badwater-distance rule. The generator's existing attempt/rescue exhaustion is unchanged.

Correcting generator acceptance or drought behavior changes maps that players see. Reducing targets, adding
expected failures or accepting those failures would bypass the task's invariants. Those product fixes belong
to the owners before the D460 gate can be green. No tracked pin or byte fixture has moved.

A detached control checkout, entirely inside `local/base/`, kept dev `c896e83c` untouched and installed its
original TS **5.9.3** and Node types **24.19.1** with `npm ci`. Its typecheck passes. Seven selected tests
reproduce the same failures: small-preset operation coverage, Delta 96² object preservation, Drought reserve,
Any 48² all-maximums seed 101, Highlands 48² starved-start seed 101, Delta 96² starved-start seed 102,
and Any 192² starved-start seed 104. This establishes existing failures for every cause group, not a second
complete heavy-suite run. Evidence: `baseline-tree.log`, `baseline-npm-ci.log`, `baseline-typecheck.log`,
`baseline-heavy-control.log` (7 failed, 82 filtered/skipped). The other seven failed upgraded cases were not
duplicated in the control. No product correction is disguised as a dependency fix.

On later dev `6e4058f3`, the same seven selected cases, on both upgrades and before the test repair, give
**6 failed, 1 passed** (`latest-heavy-control.log`). The owners' later Delta changes make the Delta 96²
object-preservation case pass; that improvement is not attributed to this patch. The repaired property then
passes there too. **Five demonstrated functional failures remain on newer dev:** Drought reserve and
the four no-map controls (Any 48² maximums 101; Highlands 48² starved 101; Delta 96² starved 102;
Any 192² starved 104). They keep the same diagnostics as the original controls. The other seven initial
failed cases and the full newer-dev nightly were not rerun; owners must verify them on the adoption commit.

Playwright's packaged engines are **unavailable locally**: Chromium's CDN requests time out; installing Firefox
separately also times out. A final WebKit-only installation fails its downloads as well. Installed Chrome
154.0.8037.98 passes the e2e, determinism and Rust checks. The Rust check verified 47,063 maths vectors,
19 water cases, 48 force fixtures, 496 analysis fixtures and
30 checks fixtures in Chrome, as well as native and Node. Firefox/WebKit were skipped by that tool and are
**not** counted as passing. Download diagnostics are in `playwright-install.log` and
`playwright-firefox-webkit-install.log`, and `playwright-webkit-install.log`. The Linux/ARM/macOS matrix and cross-host comparison require GitHub's
runners and remain unverified here.

The threaded Chrome smoke/full runs execute separately after the other jobs, using the existing worker
whose water pool has four threads. Both confirm that the threads ran; `tools/determinism/compare.ts`
then compares each manifest against the corresponding Chrome/Node run. All three manifests agree at
every checkpoint. These are split runs on the same Windows x64 host, not a cross-host matrix result.
Chrome's e2e run retains its four existing skips (optional force benchmark, local raw maps, public-site
condition and retired spike), and the saved base's explicit expected basin-highlight failure. The newer
dev includes the owner's highlight fix; its full e2e suite is not claimed as tested here.

For oracle and batch correctness, local copies of the existing tools replace their reporting-only
`performance.now()` reads with zero and omit timing text. Their imports still resolve to the same product
modules and every correctness assertion and threshold stays unchanged. The generated copies are in
`local/` (the original source hashes are in `correctness-runners.log`); they are not part of either adoption
patch. The small `correctness-runners.mjs` helper regenerates them from the current repository tools, checks
the expected count of timer reads, and prints the source hashes. Determinism uses the tool's existing
`--serial --no-timings` flags.

To reproduce the upgraded check on the recorded base: apply the two patches; update the manifest ranges to
`~7.0.2` and `^26.6.2` through the dependency PRs (lock exactly the tested 7.0.2/26.6.2); then run clean
`npm ci`, explicit compiler-version verification, typecheck, quick/heavy tests with `--maxWorkers=4`, and the
build/Rust commands from `ci.yml`. For the correctness-only oracle and batches:

```powershell
node investigation/ts7/correctness-runners.mjs
npx tsx investigation/ts7/local/oracle-correctness.ts --seeds 1-21 --sizes 96,128,256 --out investigation/ts7/local/oracle-nightly
foreach ($theme in @('any','riverValley','canyon','highlands','lakeBasin','delta','islands')) {
  npx tsx investigation/ts7/local/batch-correctness.ts --seeds 1-100 --size 128 --theme $theme --min-first 0
}
```

Install `prototype/requirements.txt` for the Python oracle, build the native water before batches, and retain
their original 98% final-pass and exact project-round-trip gates. Browser specifications use the existing
Playwright config with one worker, a dedicated port, and outputs under `local/`. Rust commands and exact
nightly gates are listed in `INTEGRATION.md` and the workflows. Run the helper from the repository root.

Both `milestone.patch` and `page.patch` pass `git apply --cached --check` against the saved `dev` base.
`page.patch` also passes that check against the saved `feature/page` base. Each check uses an isolated index
under `local/`, without touching the page branch or another checkout.
The same three checks also pass on the later tips above (`latest-apply-check.log`). Applicability is not
test evidence for those newer product commits; owners must rerun the combined upgrade on their current base.
Final checks pass on publication dev/page above (`publication-apply-check.log`); plain `git apply --check`
also passes for both patches on the restored current dev checkout. The product tree is unchanged against
that dev tip. The final report-only install passes, and typecheck plus 10 document checks pass on the
publication tip (`final-report-typecheck.log`, `final-report-docs.log`); `git diff --check` is clean.
Every CI generation prefix has 20/20 accepted, byte-identical project round trips (`prefix-and-pin-check.log`).

## Outstanding integration blocker

[PR #24](https://github.com/timbermods/dam-good-maps/pull/24) and
[PR #25](https://github.com/timbermods/dam-good-maps/pull/25) are **closed, unmerged**, since 2026-09-25 Pacific.
Dependabot closed them after these packages stopped being updated by its configuration. Their proposed versions
are 7.0.2 and 26.6.2. The owner must reopen/rebase those PRs, or restore their changes through its dependency
workflow, before the D460 merge order can be carried out. This investigation does not change those PRs.

See `INTEGRATION.md` for adoption order and the required green CI/nightly evidence. CI on this report-only PR
does not validate the upgraded product: current CI runs only `changes` for an investigation-only PR into dev.
The product tree on this branch remains the publication `dev` tree; owners must run the adoption candidate.
