# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [PLAN.md §20](../PLAN.md#20-editor-decisions); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest, all 2026-10-01 and live: `forces-done` (D375), `map-look-2-done` (D378, the High look) and `licence-agpl-done`
(D379, `main` at 87c73a0, generator 0.7.0). Every released step's tag: `git tag -l '*-done'`.

## The three sessions (D388, D398)

- **The milestone session** (Opus 5.5, high; the main clone, this machine) does everything except the page: the core, the
  water, the generator, the editor-core items, the Codex adoptions and the documents. It owns PLAN §20's numbering (next
  free: D427), STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; `C:\Users\krams\code\DamGoodMaps-page`, `feature/page`) does only "The page is
  the editor" and its design (D384). PR #163 is a draft: its `DESIGN.md` and two directions so far. Its Editor.tsx split
  (#169) is merged into `dev` (dde77fb2). It records its decisions in `DESIGN.md` and `docs/progress/page.md`; the milestone
  session folds them into PLAN when its work merges. A control the core's items need is agreed through Kyler.
- **The renderer session** (Opus 5.5, high; Kyler's PC; `feature/moving-water`) builds moving water and the Flow view, then
  renderer R1. PR #165 is a draft with CI green; it merges on Kyler's yes. It never edits PLAN, STATUS or HANDOFF.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`).

**The milestone session's work now:**

- **Water from nowhere** (D385): a dug pit filling with water outside the simulation, found on M9b's seed 34
  (`fix/water-from-nowhere`, a build agent).
- **A river-head spring keeping its id** when re-derived after a Quake Lift (`fix/spring-id`).
- **The `forceKeys.spec.ts:247` flake** (D341; `fix/forcekeys-flake`).
- **M9b step 4 and follow-ups:** brushKit back on seed 34 once the water fix lands; the dodged spring test restored after
  its fix; look-waterfalls' High lip case back as an expected failure; the Header.tsx title change Kyler allowed as a
  one-time exception.
- **M9b's quiet-window runner** is being prepared (`chore/m9b-quiet-window`).

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| M9b | `feature/m9b` | #70 draft | `-m9b` | Islands and Delta redesign (D407: Kyler's verdict on the review set blocks the release); defaults accepted (D405, D406); then the measures, the D148 re-pins, 256² speed and Lake Basin round 2 |
| The page | `feature/page` | #163 draft | `-page` | Page session; design stage |
| Moving water, Flow view, renderer R1 | `feature/moving-water` | #165 draft, green | Kyler's PC | Renderer session; waits for Kyler's yes |
| Naturalize | `feature/naturalize` | #170 draft | none | Round 3 in progress after Kyler's verdict on round 2 |
| Parity with the game's editor | `feature/parity` | #95 draft | `-parity` | Follows M9b (D337-D339) |
| Drought and Badtide, day by day | `feature/weather-days` | #73 draft | `-weather` | Held for Kyler's sitting; after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 draft | `-3d` | Wiring waits for `dev` (D280) |
| Real places, round 2 | `feature/real-places-2` | #35 | `-places` | Parked by Kyler (D319); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 draft | `-groups` | Redundant: `sourceGroups.ts` is already on `dev` |

Merged today: #159, #160, #161, #162, #164, #107, #166 (dam sketch round 2, an investigation, not adopted, D403), #168
(Rust threads, parked, D402), #169 (Editor.tsx split) and #171 (portable maths, an investigation, adopted narrowed after a
quiet-window timing, D401).

Codex's investigations (each on `investigation/<name>`; Codex builds, the milestone session merges and adopts; Kyler's
verdicts are in ROADMAP, "The Codex adoptions"):

| PR | Investigation | State |
|---|---|---|
| #158 | rust-forces | Draft; round 2 speed accepted provisionally; adoption waits for round 3's identity corpus (D400) |
| #156 | rust-water | Draft; approved; in the browser per HANDOFF's policy |
| #155 | gen-speed | Approved; rounds 1 and 2 adopted on M9b |
| #153 | small-starts | Approved; adopted on M9b |
| #152 | perf-audit | Approved; its roadmap guides the speed work |
| #150 | short-codes | Approved; findings into COLLAB-BRIEF |
| #132 | scaling | Draft; round 4 approved for adoption |
| #130 | parallel-water | Draft; approved; the multi-core path |
| #157 | rust-analysis | Merged (#160), approved; adopted after M9b's release (D391) |
| #159, #166, #107, #168, #171 | dam-sketch 1 and 2, performance, rust-threads, portable-math | Merged as investigations; see above |

## What the page session needs from the milestone session (in order; Kyler is pinged as each lands on `dev`)

1. **The water-changed signal** for the hover readout (D387 (1)): on `dev` (#164).
2. **The Remove unfed water and Fill engines** (D387 (2), (3), D394): on `dev` (#167): `unfedWater` and `planFill` in
   `src/core/doc/waterEdits.ts`; operations `removeUnfedWater` and `fillHollow`. The settle fix (D413) follows without an API change.
3. **With M9b:** its candidate events, Sources: Placed - None, and the automatic water fix: built on `feature/m9b` (APIs in
   `docs/progress/m9b.md`), on `dev` with M9b's release.
4. **The service worker** for startup part 2 (D397), with multi-core water's adoption.

## Waiting for Kyler

1. **The Naturalize round-3 sheets**, when ready (#170).
2. **M9b's next Islands sheet** (D417): Delta's shape is accepted (D416); Islands has another shape round, then 30 seeds
   at 128² beside M9a's. Also pending #155 (sea maps draw no Hanging valleys or Farmland past a gorge), his to overrule.
3. **Your yes on #165**, after your look at moving water and its gate passing (D415).
4. **The quiet window** (about 2 hours): after you accept the Islands and Delta sheets, or at 2:00 on Saturday 2026-10-03
   (Pacific), whichever comes first (D414); this session pauses all heavy work for it.
5. **The README's three new lines on the forces** (keys, Power and Size, **Slow forces**): read them once as a player.
6. **Defaults he can overrule:** `docs/decisions-pending.md` (the High look's, #83 and #110-#117).
7. **Held Dependabot majors** #24 (TypeScript 7.0) and #25 (@types/node 26): a quiet housekeeping slot (D150, D283).

## The release gate (D385–D387)

The water and the editor's core must be perfect before the next release; the editor-core items and the coherence review that
follow are in [ROADMAP.md](../ROADMAP.md) ("Before the next release"). Also blocking the release: Islands (D417), and Real places in the gallery (D421: hide the 33 places whose start reaches no fed water; fix
`tools/real-places.ts` and re-render the cards). The settle fix (D413) is on dev (#175).

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
