# Settings prototype: adoption notes

Round 2 base: feature/m9b at `e292cefe30469033a922650f0455f87297c051d5`,
merged first into investigation/settings. Product code matches `13d1f1a2`; later
commits add the hand-over and matching baseline. Product source was never edited.
Adoption gates and remaining failures: [REPORT.md](REPORT.md).
**Held for adoption:** measured direction passes; validation at 96², theme outcomes,
uniformly conspicuous lake steps and speed still need the work described in the report.

## Adopt independently

- **verticality.patch**: a post-floor height budget, before Terracing, rising to 22 when allowed.
  Relief remains relative; Highest terrain stays a hard cap. Each value uses the same seeded
  geological recipe: the theme's default, except Any uses the balanced value 60. Any and
  Highlands anchor the lower contour before spreading ranked heights. Canyon retains minimum incision;
  Highlands retains benches/incision; Lake Basin limits cuts that drain its signature lakes.
  These are controller parameters. Delta retains its original field/network geometry budget
  and spreads only its higher dry catchment; Islands spreads dry contours above its existing
  coast, preserving inlet lips and its small landmark. Both use the newly adopted shapers.
- **lakes.patch**: fixed substrate plus an absolute additional-water budget, replacing
  preset-relative optional water. Signature lakes/seas remain at zero. Canyon reserves channel
  substrate above the bed floor for holding basins, retaining cliff separation. At 96² it
  retains native water so starts have viable banks. Delta reserves one height level before
  starts/water preparation, keeping its channel layout and plain; its floor-running channels
  otherwise offer no lake excavation depth. The reserve is skipped for regeneration contexts.
  Connected basins have varied sizes,
  noisy shores and broad feeder connections; Highlands prefers lower feeders.
  Their full potential area is reserved across amounts.
  The hook runs **after** outlet widening, starts, mine room/access and badwater hollows,
  **before** the sole land snapshot/notification. It protects prepared play space, locks,
  existing water and high landforms, refreshes planned hydrology/lake features and invalidates
  the pre-fill before the existing dam-wall screen. No new sources or dams.
- **prototype.patch**: both together, instead of either independent patch.

Each patch passes git apply --check separately on the stated base. Independent diffs share
settingsShape.ts and generation/genome contexts: **do not apply them consecutively as blind
patches**. Adopt either alone; when adding the second, keep the helper once, combine hooks/imports
and use control flags 3. The combined patch shows that result. Transfer hooks manually if a newer
M9b moved their contexts. Do not cherry-pick the base-merge commit. To transport the investigation
by commits, take Round 1 `dc0dd101` and its Round 2 follow-up in order; neither edits production.
The compatibility helper substitutes only these controls in the adopted Islands shaper's
eligibility spec; the actual settings still reach their controllers. Other scope restrictions stay.

## Contract choices

None/Few/Some/Many map to **0/25/50/100**. Optional integer water.lakeAmount (0–100) overrides
the category, allowing the requested 75; schema and la codec support it. The UI is unchanged.
Categorical edits must clear lakeAmount. Adoption may expose a numeric control or retain categories.
Suggested tooltips: “Grow lakes along the rivers”; “Shape rolling land and dramatic cliffs”.
The gentle end retains each theme's minimum signature relief. The sweep follows the UI/codec
height default: 16 below Verticality 70, 22 from 70.

## Reproduce

Node 24, repository dependencies, Python with Pillow; run from the repository root.
Bulk maps, JSON, bundles, logs and unsuccessful pilots stay in gitignored investigation/settings/local/.
Only compact contact sheets and CSVs are committed, including a constant-scale isometric
Verticality sheet so height changes can be judged separately from top-down colours.

```powershell
node investigation/settings/build.mjs baseline
node investigation/settings/build.mjs verticality
node investigation/settings/build.mjs lakes
node investigation/settings/build.mjs prototype
node investigation/settings/check.mjs
node investigation/settings/local/guards.mjs
node investigation/settings/queue.mjs '[{"bundle":"baseline","command":"experiments","out":"r2-release-nightly-baseline"}]'
node investigation/settings/queue.mjs '[{"bundle":"prototype","command":"experiments","out":"r2-release-nightly-combined"}]'
node investigation/settings/queue.mjs '[{"bundle":"prototype","command":"adjacent","out":"r2-release-adjacent-fixed"}]'
node investigation/settings/queue.mjs '[{"bundle":"verticality","command":"experiments","out":"r2-release-nightly-verticality","experiments":"Verticality"},{"bundle":"lakes","command":"experiments","out":"r2-release-nightly-lakes","experiments":"Lakes and basins"}]'
node investigation/settings/queue.mjs '[{"bundle":"verticality","out":"r2-release-verticality"},{"bundle":"lakes","out":"r2-release-lakes"},{"bundle":"verticality","command":"smoke","out":"r2-repeat-verticality","seeds":"1","values":"0,100"},{"bundle":"lakes","command":"smoke","out":"r2-repeat-lakes","seeds":"1","values":"0,100"}]'
node investigation/settings/queue.mjs '[{"bundle":"verticality","command":"default","size":96,"out":"r2-default-verticality-96"},{"bundle":"verticality","command":"default","size":128,"out":"r2-default-verticality-128"},{"bundle":"verticality","command":"default","size":256,"out":"r2-default-verticality-256"},{"bundle":"lakes","command":"default","size":96,"out":"r2-default-lakes-96"},{"bundle":"lakes","command":"default","size":128,"out":"r2-default-lakes-128"},{"bundle":"lakes","command":"default","size":256,"out":"r2-default-lakes-256"}]'
node investigation/settings/queue.mjs '[{"bundle":"prototype","out":"r2-tall-256","size":256,"seeds":"1","values":"100"}]'
node investigation/settings/queue.mjs '[{"bundle":"lakes","out":"r2-small-canyon-range","size":96,"themes":"canyon"}]'
node investigation/settings/local/render.mjs investigation/settings/local/r2-release-verticality
node investigation/settings/local/render.mjs investigation/settings/local/r2-release-verticality iso
node investigation/settings/local/render.mjs investigation/settings/local/r2-release-lakes
$env:SETTINGS_SWEEP_PREFIX='r2-release'
python investigation/settings/analyze.py
python investigation/settings/compare.py
node investigation/settings/verify.mjs verticality r2-release r2-repeat
node investigation/settings/verify.mjs lakes r2-release r2-repeat
git apply --check investigation/settings/verticality.patch
git apply --check investigation/settings/lakes.patch
git apply --check investigation/settings/prototype.patch
git diff --check
```

build.mjs overlays sources in memory and emits genuine diffs; it never writes src/ or tools/.
An optional third argument tags pilot bundles/patches under local/. check.mjs checks the overlay's
types; guards cover all 101 values, floors, caps, schema/codec, protected tiles, unchanged channels,
deterministic nested basins and closed spill rims. run.ts uses production validators and six-day
canonical settling. Rows record base/overlay hash, land notifications and post-show changes
excluding permitted D350 wear. Failed maps stay in the sweep; empty exports are not determinism evidence.

Each independent sweep has 175 maps: seven themes, 128², five values, seeds 1–5.
analyze.py priority-floods terrain for natural basins of 20+ tiles. “Held” counts their clean wet
tiles (depth >=0.1, contamination <0.3), including signature water. It retains basin filling and
every adjacent comparison in STEP_GAINS.csv, and rejects mixed builds. A positive measurement
alone does not certify visibility. Settling does not prove every basin is full.
compare.py pairs 210 default-setting maps with the committed matching baseline: both patches,
seven themes, 96²/128²/256², seeds 1–5. OUTCOMES.csv keeps each outcome, validity, gains/losses
and speed per theme/size.

D333's 128² target is **final settled map** median/p90 2/5 s, not first water.
At 256² targets are land 3/6 s and first water 8/20 s. Raw times and M9b's process-CPU-share
estimates are separate; shared-machine estimates are diagnostic, not idle-host certification.
Bring costs within the targets, then confirm speed alone on an idle host. No Timberborn probe.
After resolving the held gates and adopting, update semantics,
tooltips and generator version, then run M9b's release gates and re-pin under its existing rules.
