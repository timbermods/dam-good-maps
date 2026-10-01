# Settings prototype: adoption notes

Base: `feature/m9b` at `6c29b7e524eea5739d49b6f0df2eae3b0856f4bd`.
Only this investigation's commit is for cherry-picking. Product files have not been edited.
The patches are proposals, not an adoption recommendation: the complete sweep's remaining
validation failures and step reversals are recorded in REPORT.md.

## Adopt independently

- `verticality.patch`: adds `src/core/land/verticality.ts` and one `leanGenome` hook after the
  bed-floor raise, before Terracing. The displayed Verticality owns the span above the raised
  base, uses the actual height cap, retains Relief's relative influence, scales incision and
  hanging valleys down at the gentle end, and keeps more natural ramps at the tall end.
  Readability, cleanups, sources, outcomes and validators remain the product's.
- `lakes.patch`: adds `src/core/land/lakes.ts`, replaces the preset-relative lake adjustments,
  and adds one hook at `planHydro`'s return, before the existing land-stage repairs. It excavates
  connected side basins along existing rivers, reserves the full potential basin, and grows
  its connected area with the setting. Existing river channels and sources stay at their levels;
  protected tiles, existing lakes and the bed floor are respected. No new sources or dams.
  Zero retains signature lakes and seas. Theme priors, sea layouts, Delta's fan and River Valley's
  shaping are unchanged. Use this hook after any separately adopted theme shaping too.
- `prototype.patch`: both together. Use it **instead of**, not after, the independent patches.
  The independent patches also pass `git apply --check verticality.patch lakes.patch` together
  on the stated base. On a newer M9b, place the two hooks manually if their context moved.

Apply with `git apply --check <patch>` first, then `git apply <patch>` in the adopting agent's
checkout. Keep the investigation commit separate from its adoption commit.

## Settings contract choice

The current Lakes control has four categorical values. This prototype retains them, mapping
None/Few/Some/Many to 0/25/50/100, and adds an optional integer `water.lakeAmount` (0–100) to
measure the requested intermediate 75. The schema accepts it; `la=75` round-trips through the
codec. When present it overrides the categorical value. The UI is unchanged. Adoption must
either wire a numeric control and its accurate tooltip, or retain the four choices and omit
the optional field in user input; a categorical edit must clear `lakeAmount`.

Variety still changes landforms; it cannot move the explicit post-floor Verticality budget
away from the player's value. Highest terrain remains the hard cap. At each sweep point its
default follows Verticality (16 below 70; 22 from 70), as the UI/codec do.

## Reproduce (Node 24, repository dependencies; Python with Pillow)

Run from the repository root. Every output goes under this investigation; the existing
`.gitignore` ignores `investigation/*/local/`.

```powershell
node investigation/settings/build.mjs baseline
node investigation/settings/build.mjs verticality
node investigation/settings/build.mjs lakes
node investigation/settings/build.mjs prototype
node investigation/settings/check.mjs
node investigation/settings/local/guards.mjs
node investigation/settings/local/baseline.mjs experiments investigation/settings/local/baseline-nightly
node investigation/settings/local/prototype.mjs experiments investigation/settings/local/nightly-candidate
node investigation/settings/local/prototype.mjs adjacent investigation/settings/local/adjacent
$env:SETTINGS_CONTROLS='verticality'
node investigation/settings/local/verticality.mjs sweep investigation/settings/local/final-verticality
$env:SETTINGS_CONTROLS='lakes'
node investigation/settings/local/lakes.mjs sweep investigation/settings/local/final-lakes
Remove-Item Env:SETTINGS_CONTROLS
node investigation/settings/local/render.mjs investigation/settings/local/final-verticality
node investigation/settings/local/render.mjs investigation/settings/local/final-lakes
$env:SETTINGS_SWEEP_PREFIX='final'
python investigation/settings/analyze.py
```

`build.mjs` overlays sources in memory through esbuild and emits genuine adoption diffs;
it never writes `src/` or `tools/`. `check.mjs` type-checks the same overlay. The guards
exercise caps, floors, protected tiles, unchanged feeding channels, signature preservation,
schema limits and deterministic connected basins across all 101 values. `run.ts` calls the
unchanged nightly experiments and normal production `generate`, including its validators and
six-day canonical settle. Failures remain in the sweep; no map is silently replaced in reporting.

Each independent sweep is all seven themes, 128², five values, seeds 1–5: 175 maps.
`analyze.py` independently priority-floods the final terrain to find natural basins of 20+
tiles, then counts their clean wet tiles (depth >=0.1, contamination <0.3). "Held" in the
sheets means those tiles; it includes signature water and excludes flowing reaches without a
natural depression. Basins need not all be fed: canonical settling alone is not proof every
depression is a holding lake. Per-basin filling and every adjacent-step reversal are in local
analysis JSON. The compact CSV is per-theme/per-step; all maps, bulk JSON, logs and pilot
iterations remain local. No Timberborn probe was run.

After adoption: update PLAN's setting semantics, the generator version and accurate tooltips,
then run M9b's full release checks and re-pin only under its existing rules. Resolve the named
failed maps and make adjacent steps visibly reliable before adopting either proposal as complete.
