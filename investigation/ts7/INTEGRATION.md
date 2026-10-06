# Adoption order and D460 gates

1. The milestone owner applies `milestone.patch` to `dev`. It adds the compatibility API, disambiguates the
   compiler command, annotates milestone-owned numeric declarations, and provides the missing property-test
   water-tool precondition without changing its seed or assertions. It **does not** bump TypeScript or
   Node types, so #24 and #25 retain those changes. Run `npm ci` after adopting the patch.
2. The page owner applies `page.patch` to both `dev` and its long-lived `feature/page` branch, coordinating the
   usual ownership/merge order. It contains only the `src/editor/brushes.ts` annotation. It applies to both
   recorded tips without a three-way application. Carry it forward when the page branch next merges.
3. Reopen and rebase Dependabot **#24 (TypeScript 7.0.2)** and **#25 (`@types/node` 26.6.2)** onto prepared dev.
   Both are currently closed and unmerged. Rebase/regenerate their locks; do not replace dev's current lock with
   either PR's old whole lockfile. Preserve the new API dependency. Confirm the actual compiler with
   `node node_modules/typescript/bin/tsc --version`, since an unqualified `npx tsc` can resolve to the API's TS6.
4. Check the prepared product with **both upgrades together**, including the full CI and nightly workflows.
   Merge #24, then rebase and merge #25 through the owners' normal review/queue process, only with the evidence
   D460 requires. Neither is approved or merged by this investigation. Check nightly on the combined adopted
   commit; a green report-only investigation PR is insufficient.

Do not treat the preparation patches as approval to adopt the majors: the recorded 0.8.1 validation base
initially has 14 heavy-suite failures. The test-only coverage failure is repaired by the milestone patch.
Untouched dev with its original dependencies reproduces the selected controls. Newer dev already resolves
the Delta object-preservation control, but five selected functional failures remain there after coverage is
repaired. See `REPORT.md` for exact cases. Owners must resolve the remaining product causes on their current
dev, without weakening tests, and demonstrate a green complete nightly before either major is merged.

The patches were checked on dev `c896e83c092960c4ddb5939207e1d99863a19ac8` and page
`beee673e2dc3fb75d04277f0baf47755deb9fae9`. If either tip moves, repeat `git apply --check` on its new tip;
resolve ownership conflicts at the source, with no pin/fixture updates.
The checks were repeated successfully at dev `6e4058f38e359b396969be64a5c975ed12f425f5`
and page `407e096aca39427707e9eef7dbcaee280886dfc1`; full suite results refer to the saved 0.8.1 base.
The later dev snapshot separately passes install/typecheck/build/source guard and the repaired small
property; its selected functional controls remain red as detailed in the report.
Final publication checks also pass on dev `7cc59f672a203611de72e8b43cf31da4fc6bdb18` and page
`826919d055792372f759bda9bf821b7fe859a451`; that dev passes TS7 typecheck/build/source guard. The full
suite was not repeated on that tip. Its brush/source behavior and CI changes are the owners' changes.

## What CI must show

- Clean `npm ci`, TS7 typecheck, and production build. Keep the existing strict compiler options.
- Current `ci.yml`'s light product set: both quick unit/contract shards (`--shard=i/2`, typecheck/build on
  shard 1) and all four browser shards. Investigation-only PRs into dev run `changes` alone; that green
  status is not upgrade evidence. The local unsharded quick run covers the whole saved-base set.
- `ci.yml`'s full product set: those jobs plus the Python oracle (seeds `1,5,9,10,14,18,19`, sizes `96,128,256`),
  seven 20-seed generation batches at 128, and cross-engine determinism smoke in Chromium, Firefox, WebKit,
  Node, Chromium threads and Firefox threads. Package dependency changes must also classify Rust as required.
- All Rust steps from `ci.yml`: fresh committed-Wasm identity and native binaries; water/analysis/checks
  contracts; all eight stacked-water goldens; native/Node/app water identity on one/four threads at
  `96,128,256,512`; source/IR/assembly/Wasm maths guards and portable/water/forces/analysis/checks identity
  across native, Node and all three browsers. Every existing byte pin stays exact.
- Both production builds in Playwright's web server: `vite build --mode e2e`, then the public-build variant
  with `/dam-good-maps/public-build/`, and the browser specs passing against them.
- `nightly.yml`: heavy unit/contract project, full oracle seeds `1-21`, seven 100-seed batches, full determinism
  on Linux x64/ARM64, Windows x64 and macOS ARM64, and cross-host manifest comparison. All green on the upgrades.
- No standalone lint script, linter config, or lint job exists on this dev base. The portable-maths,
  module-boundary, document and other existing source guards run in the quick suite; retain them unchanged.

Run checks with no more than four workers/jobs on the shared machine. Use correctness-only determinism flags
`--serial --no-timings`, and do not run benchmark commands. Any byte/pin movement blocks adoption: report the
first difference and leave the committed fixture untouched. Large logs/results belong in gitignored
`investigation/ts7/local/`, not in the patch or PR.
