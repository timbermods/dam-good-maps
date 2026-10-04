# Parity core adoption

Built against `dev` **514c9437133bf4743efa7f4eed60da7f840587ff**, using parked parity
**881164b6f66d85b22ddc0d1e76d1714fe93bf0e1**. Read D337, D338, D339, D342, D368 and D425 in
PLAN §20 and docs/archive/decisions.md; dev has no docs/decisions/ directory.

The branch changes only this investigation. [adoption.patch](adoption.patch) contains the product proposal;
[INTEGRATION.md](INTEGRATION.md) describes adoption and [PAGE.md](PAGE.md) lists the page work.

## In the patch

- The pinned game data and existing exported footprints: both seeps, aquifer and drill, Badtide Drain,
  Unstable Core, the three reserves, goods, capacities, countdowns and strength ceilings. **The drain is
  1×3 in the game data**, correcting D337's 1×2 shorthand.
- Placement, movement, deletion and options through today's operations; exact component ordering and
  float writing. New planned water/badwater sources default to 1/3. Historical no-component badwater
  placements retain their old strength 1 so saved operations keep their meaning.
- Sinks, seep hysteresis (off above 0.8, restart below 0.72), initially disabled seeps, capped seep prefill,
  delayed sources, and unpowered aquifers. A plain timeline function activates delayed sources and
  badtide-only drains from an explicit cycle calendar, without changing saved objects.
- Core blast questions: sphere, chain reactions, removed objects and unsupported terrain, followed by
  water and soil recomputation. These return a view without changing the document or adding objects.
- Explicit player scatter placement for Succulent, mixed woods, trees, bushes, ruin fields and thorns;
  density and Age, literal placement records and one undo step. Ordinary terrain brushes and forces
  do not call this path. D425's existing resource/slopes rebuild remains intact.

## Rebuilt for dev

The session connection keeps today's terrain riding, history grouping, Fill and Remove unfed water;
it does not restore specPatch. The placement batch accepts only checked placeEntity operations and
refuses duplicate IDs and footprints before changing anything. Options are checked after merging with
the current object's components, so a partial reserve edit cannot leave mismatched goods. Stock is
never rounded or clamped; invalid amounts, shapes, goods, delays, strengths and radii have one-line reasons.
New emitters also ride terrain edits as whole footprints. Invalid core questions refuse in one line,
and the preview preserves unrelated raw entities.

Carried: the pinned values, entity serializers, scatter and explosion rules, and the old parity tests,
updated for current contracts. Rebuilt: session/schema connections, full-state option validation,
fluid timeline activation, and the Rust sink/seep changes. No editor, UI, renderer, worker, probe runner,
models or old interface wiring is in the patch.

## Verification

**243 checks passed across 15 suites; 2 local-data-dependent checks skipped.** Typecheck and the rebuilt Rust Wasm also pass. The affected parity, format, operations, document, terrain-source, edit-sequence, water,
Rust binding and boundary suites pass. Complete files containing **every new object, including the drill**
pass load checks and preserve entity JSON through .timber and project reopening; .timber write/read/write
is byte-identical. Footprint sizes agree with the existing game-exported footprint table.

Compared untouched dev with the candidate: **14 identical exports** (all seven themes at 96² seed 3,
Canyon with cores enabled, five saved project fixtures, and the existing .timber fixture's export).
The intentional exception is **recalculated seep water**: the probe-confirmed cap changes only seep_pit's
prefill/canonical/drought golden data and its two pinned digests. The independent Python reference agrees;
all other water digests stay pinned. Stored imports are preserved; editing or canonically rebuilding an
old seep basin uses the corrected rule. This is not a claim that every historical map was exhaustively checked.

Rust's rebuilt Wasm passes sink/seep byte comparisons against dev's matching TypeScript port rules.
The Rust switch re-ports the game rules; its exact integration points are in INTEGRATION.md.
No Timberborn launch, probe batch or speed measurements ran. The old probe evidence is provenance,
not a fresh game-load claim. Under-roof water and the drain's roofed direction limiter remain the
heightfield engine's existing limitation; the blast result reports roofed tiles explicitly.

## Expected cleanup overlaps

Against each branch's merge-base with dev (the cleanup branches stack):

| Branch | Files shared with this patch |
| --- | --- |
| cleanup/2-one-flood | doc/ops.ts; features/objects.ts; sim/water.ts; validate/playability.ts |
| cleanup/3-forces-core | Above, plus doc/ops.schema.json and doc/session.ts |
| cleanup/4-force-planning | Same six files as cleanup/3-forces-core |
| cleanup/5-water | Same six files as cleanup/3-forces-core |
| cleanup/6-analysis | Above, plus doc/tools.ts and features/edits.ts |

Paths in the table are under src/core/. Resolve against the adopted cleanup implementation, preserving
checked explicit placement and the existing no-resource-regrowth behavior. Rust-switch overlaps are
sim/prefill.ts, sim/water.ts, sim/waterWasm.ts and rust/water/src/sim.rs; it removes sim/waterRust.ts,
which the new Rust comparison tests currently import.

All source snapshots, dependencies and generated results stay in ignored local/. No measurements or
gate scripts are committed. To recreate the candidate, extract the pinned dev commit into local/candidate/,
apply adoption.patch there, install its lockfile and run the commands in INTEGRATION.md. Byte comparisons
use the fixtures and eight generation cases named above; they do not need the game or external map files.
