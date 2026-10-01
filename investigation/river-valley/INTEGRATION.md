# River Valley adoption

Base: `feature/m9b` at `6c29b7e524eea5739d49b6f0df2eae3b0856f4bd`.
Cherry-pick only this investigation's commit(s). All tracked changes are inside
`investigation/river-valley/`; product sources were read, never edited.

`adoption.patch` proposes changes to `land/genome.ts` and `land/hydro.ts` only:

- Broader variable valley floors: draw prior 12–16 instead of 7–13, with the existing Variety
  widening and size scaling. Keep the original terrain, erosion, noise and terrace draws.
  The lean is applied at River Valley's draw, after `Any`'s combined prior is computed.
- One dominant default inflow. The explicit Rivers count remains player-owned.
  At most four default heads below 256², five from 256², so large maps feed a few readable
  tributaries rather than spreading the same flow among seven shallow courses. Four at 256²
  lost reach in the full sweep; the extra head retains coverage. Explicit Rivers requests retain
  the existing cap.
  Tributaries join the existing system; the separate-stream fallback
  is disabled for River Valley.
- Splits remain where a split/twin-falls intention asks for them; a delta remains with explicit
  Braided style.

Every guard is River Valley-specific. No seed-specific cases, layout templates, outcome thresholds,
water-engine changes, or changes to the first-map selection policy are included.

**Lake-tile channel gap: fixed in feature/m9b** (`8750c300`, verified from the branch).
The comparison harness uses that implementation's exact behavior on River Valley: lower only
lake tiles inside the channel and retain their lake classification and lower floors.
`transform.cjs`'s `shared` option
controls it separately; it is **excluded from `adoption.patch`**. Do not adopt that replacement:
use M9b's shared implementation, then rerun the measurements there. `shared` control measurements
isolate the gap fix from the theme shaping; they are not a second adoption patch.

On M9b's checkout, inspect/apply the proposal with:

```powershell
git apply --check investigation/river-valley/adoption.patch
git apply investigation/river-valley/adoption.patch
```

The patch is based on the pinned commit. If M9b has moved, adapt its small hunks to the current
files, retaining the River Valley guards and the downstream shared lake fix. The product's living
docs, generator-version bump, and deliberate fixture re-pin belong to adoption on M9b (D308),
not this investigation. Carry the remaining misses in REPORT.md into that decision.

Regenerate from the pinned checkout, with Node >=22 and Python + Pillow (run at repository root):

```powershell
npm install --prefix investigation/river-valley/local typescript@5.9.3 fflate@0.8.3
node investigation/river-valley/batch.cjs before
node investigation/river-valley/batch.cjs shared
node investigation/river-valley/batch.cjs after
python investigation/river-valley/analyze.py
node investigation/river-valley/typecheck.cjs
$env:RV_MODE='before'; node investigation/river-valley/run.cjs check.ts
$env:RV_MODE='after'; node investigation/river-valley/run.cjs check.ts
node investigation/river-valley/patch.cjs
python investigation/river-valley/patch.py
git apply --check investigation/river-valley/adoption.patch
git diff --check
```

The loader transpiles the **unchanged `investigation/m9b/measures.ts`** and product code in memory;
it never applies a patch to `src/`. One worker generates each batch's maps serially. Default
River Valley settings, first maps, seeds 1–20 at 96²/128²/256²; no sibling search. CPU-normalized
timings are also retained because this is a shared computer. Full JSON lines, per-map fields,
river profiles, checks and PNGs live in gitignored `local/`. `maps.csv` records every before/after
verdict and reason; `shared-maps.csv` records the separate lake-fix control, and
`shared-control.json`, `summary.json`, `variety.json` and the small contact sheets stay in git.

The byte checks exercise seed replay and saved-field/feature rebuild, plus seed 21 at 96² in every
other theme (including Any, Islands and Delta), and preservation of an explicit three-inflow request.
Other-theme parity isolates this proposal: measurement support for the shared lake fix runs only
on River Valley. It does not claim M9b's global fix leaves other themes' bytes unchanged.
All 60 prototype maps use the existing blocking validator and canonical settle. No new Timberborn
probe was run; replay/rebuild and validator results do not substitute for M9b's in-game release probe.

D348: the prototype changes only shaping before `onLand`. It preserves the stock one-land policy;
the existing local start/badwater fixes and capped D350 outlet wear remain. `shown`, `lands`,
`changed` and `fixes` are retained to distinguish local completion cuts from a replaced land.
