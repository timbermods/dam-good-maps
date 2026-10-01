# Adoption

Base: `feature/forces` at `32aee5cf` (latest when this investigation began). This branch contains only
investigation commits. The milestone should cherry-pick those commits, then deliberately adopt the
patch; do not merge the investigation branch's inherited forces history just to take these files.
Product files were read and bundled, never edited. `docs/COLLAB-BRIEF.md` was read from `origin/dev`
because it is absent from the forces base.

## Reproduce

From the repository root, Node 24 and Git installed:

```sh
cd investigation/determinism
npm run setup
npm run browsers
node audit.mjs
node probe.mjs
node run.mjs
node run.mjs --adoption
node make-patch.mjs
node typecheck.mjs
node typecheck.mjs --adoption
node guard.mjs --adoption
cd ../..
git apply --check investigation/determinism/adoption.patch
```

On Linux use `node local/runtime/node_modules/playwright/cli.js install --with-deps chromium firefox webkit`.
Dependencies and engine revisions are pinned by the isolated runtime lock. Playwright 1.58.2 was
chosen to match the installed engine revisions for this investigation; it is independent of the
product's Playwright dependency. Setup and all browser
bundles, dumps, patch scratch files and full manifests live in gitignored `local/`. No installed
Chrome/Safari fallback is allowed. Baseline mismatch/failing-invariant exits are expected before adoption.
`--smoke` keeps every theme/size and the full power/size force grid, while shortening sequence lengths
and using one generation seed. A clean run is the CI path. `--resume` is a local investigation aid:
it reuses successful cases only at the same source commit, engine versions and suite mode, and reruns
failed/new cases. Do not use it in CI or to compare changed harnesses generally.

The main grid generates all seven themes at 128²/256², seeds 1, 37 and 20260930. Each brush runs at
strength 1/5/10 and radius 0.5/6.25/24. Every adopted force runs at Power 10/55/100, Size Auto/12/48,
click and drag equivalents (Carve's width is diameter/4, capped at 24; Quake has no Size control).
Extra cases cover square/target strokes, dry Carve, click-created Quake faults, nondefault reserves,
120-step mixed force/brush sequences, 80-step session sequences and 120 seeded placement/tool attempts
per size. Undo, redo and project reopening are checked. Weather is stepped by explicit tick/day inputs.
The fixture contains clean/badwater sources and many trees; it deliberately exposes raw direction data.

SHA-256 covers the complete row-major terrain, depth, contamination, entities (IDs and all components),
fresh rock, geology, fallen poses and recorded operation; generation also covers features, stored field,
moisture, soil contamination and full `.timber` bytes. Water checks include outflow momentum. Floating
arrays use explicit little-endian binary64, preserving signed zero; non-finite map values fail. JSON
keeps array/property order and distinguishes negative zero. Per-component hashes localize every mismatch.
Long sequences hash each edit and water step, not just the final map.

To regenerate the causal-isolation evidence and compact summary, from `investigation/determinism`
in PowerShell (after the two full sweeps above):

```powershell
$env:DGM_DET_FUNCTIONS = 'hypot'
node run.mjs --adoption --only '^(force/128/craterize/55/null/0$|force/128/glaciate/10/48/0$|mixed/256$)' --out hypot-only
$env:DGM_DET_FUNCTIONS = 'exp'
node run.mjs --adoption --only '^weather/' --out exp-only
Remove-Item Env:DGM_DET_FUNCTIONS
node run.mjs --adoption --only '^(force/128/glaciate/10/48|scheduling/)' --out final-sanity
node summarize.mjs
```

In POSIX shells prefix each isolation command with `DGM_DET_FUNCTIONS=hypot` or
`DGM_DET_FUNCTIONS=exp` instead. Baseline's nonzero exit reports the expected failures;
continue with the adoption sweep. Full sweeps can take over an hour on this host.

## Apply intentionally

```sh
git apply investigation/determinism/adoption.patch
```

The patch adds `core/math/portable.ts`, replaces native approximate math and `**` in core, fixes
the weir comparator's equality, and makes the worker persist a staged force's deterministic stage
count. `--adoption` tests those transformations in memory. The clock-policy check extracts the actual
`steps` expression from the worker AST and exercises real staged runs under two planning budgets.

| Fix | Changes today's results? | Adoption action |
| --- | --- | --- |
| Reuse existing sinDet/cosDet/expDet; add fixed-order atan/atan2/log/log2, exp(log·exponent) powers and integer-power multiplication | Yes, native numeric results can change. Even a tiny change may cross an integer terrain/placement threshold on an untested seed. | Re-pin affected generator/force/parity expectations under D148; bump generator/replay version as needed for share links. Keep old literal force operations and stored bases unchanged. |
| Fixed-order scaled hypot using correctly rounded Wasm sqrt | Yes: raw fallen directions differ today. Numeric probes match Chromium's hypot on this sample, but this is not promised for all inputs. | Same re-pin/version gate; do not claim a rounding-only, result-preserving fix. |
| Wasm sqrt replaces native Math.sqrt | No observed differences on this host/probe/suite; it strengthens a guarantee JS itself does not provide. | Verify pins on the CPU matrix before asserting byte preservation. Wasm's one-function module is embedded, no fetched binary. Check CSP allows Wasm compilation in deployed workers. |
| Preserve existing reductions/iteration and stable input-index ties | No change. | Keep tests; do not add ID sorting that changes collision/resource winners. |
| Weir comparator returns zero for equal IDs | No changed ordering for valid distinct IDs. | Keep current pins; invalid duplicate identities remain invalid. |
| Store `r.total` instead of `r.steps` for staged results | New operation metadata changes; final terrain/water/entities and existing replay do not. | Update operation-record pins. No map re-pin is intrinsically needed for this one-line fix. |
| Host allocates one gesture identity, seed and source IDs; peers consume the same envelope | Existing recorded operations unchanged; new independently random IDs/seeds necessarily change. | Implement at collaboration milestone; no blanket replacement of unrelated UI randomness. |
| Host normalizes world-coordinate paths, modes, dabs and pressure; any repeated gesture-to-op geometry moves to core/portable math | Existing recorded operations unchanged; new gestures near spacing or tap thresholds can change. | Send core force requests and finished brush operations, rather than independent screen-event streams. Update gesture-operation pins if the conversion is changed. |
| Agree force input water and geometry, not each peer's live preview at arrival | May change force behaviour compared with independently timed previews. | Protocol must order the operation and use an agreed canonical/tick-numbered water snapshot. |

For collaboration, put `documentId`, `epoch`, monotonically ordered `sequence`, the force's seed,
normalized world-coordinate gesture and mode, keep mask and water snapshot identity in the host envelope. For generated object IDs use
the existing `guidFrom(documentId, epoch, sequence, role)` (distinct role/slot per object). Naturalize
already carries a seed: distribute that recorded value. Source UUID creation must occur once at the
host or be replaced by this derived ID, never once per peer. This protocol wiring is a proposal,
because the collaboration feature is not on the investigation's base; no untested worker rewrite is supplied.

The portable math is deliberately limited to finite map-domain arguments. Atan range-reduces to
|x| ≤ tan(π/8), then uses 24 alternating terms; log scales by exact powers of two and uses 24
atanh-series terms at |z| ≤ 1/3. Hypot sums scaled squares in argument order. Powers reject values
outside expDet's documented finite range. It is not a drop-in general-purpose Math library.
`MATH-RESULTS.json` records numerical error against each native engine; that comparison is not a
high-precision accuracy oracle. Keep tests for signed zero, quadrants, finite domains and bounds.

## CI

After adoption, copy `ci.yml` to `.github/workflows/determinism.yml`. It checks **actual product code**,
not the preview transform, in all three engines, on Linux x64/ARM64, Windows and macOS ARM64, and
compares manifests across hosts with `compare.mjs`. PRs run the shorter suite; nightly runs all seeds
and long sequences. Errors, missing/truncated manifests, mismatches and clock-dependent records fail.
Upload JSON evidence on failure; local/ remains untracked. Runner labels follow the
[GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The workflow runs `guard.mjs`, which rejects new approximate Math calls, unseeded randomness or `**`
in deterministic core outside the portable module. The generated inventory is broader than a simple grep and avoids
comment matches; presentation-only paths require explicit classification. A finite test suite is
regression evidence, never a proof over every seed, engine revision and CPU. Fixed-order arithmetic
and the Wasm sqrt specification provide the portability argument; the host matrix checks its execution.
