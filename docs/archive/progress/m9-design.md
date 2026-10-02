# M9 design step (design version 1)

Branch `investigation/generative`, merged into `dev` as PR #14. Design:
[docs/m9-design.md](../m9-design.md); numbers:
[investigation/generative/REPORT.md](../../../investigation/generative/REPORT.md). Kyler approves design
version 2, not this one.

- **The design:** a genome of continuous parameters per theme prior; uplift, erosion and levels make
  the land; rivers, lakes, falls, pools, splits and deltas come from its drainage; the start, dam
  sites and badwater hollows are found, never built. No dam ridge anywhere (Kyler's no-dam-ridge
  decision, 2026-09-25). The product's own objects, resources, build and validators run unchanged.
- **Prototype** (`investigation/generative/`, no `src/` change): six themes, 200 seeds each at 128²
  plus 30 each at 96², 192² and 256². Final pass rate 100% in every theme and size (first attempt
  53–97%). Zero built dam walls on 1,740 maps (the current generator: 765 of 1,200 at 128²). No
  clones and play variety pass in all six themes; whole-map archetypes fail in five of six and no
  approximation fails in all six (REPORT.md §9 says why and what would fix each). Both validators
  agree on every check; the same seed gives the same bytes. Ten playable maps in
  `investigation/generative/out/`, a one-page brief for each in `investigation/generative/briefs/`.
- **Staging proposed** in ROADMAP M9 (M9a terrain and water, M9b composition and variety, M9c score,
  names and candidates), with the new gate, two design rounds, zero built dam walls and the
  permanent checks in M9's acceptance, and `npm run sheet` in M9a.
- **Codex investigations:** the cycles (PR #10) and mechanics (PR #9) branches finished during the
  step and are used read only (simulated play, the briefs). PR #11 supersedes #9 with a corrected
  power axis, and `investigation/landscapes` had no branch or PR: both are version-2 inputs.

**What Kyler needs to do for this step**
1. Read the ten briefs (`investigation/generative/briefs/`) and the measures (REPORT.md §3–§4).
2. If you want, play one or two of the ten maps: copy a file from `investigation/generative/out/` to
   `Documents\Timberborn\Maps`, then pick it under **New game**.
3. Decide the design's proposals when convenient: the staging (ROADMAP M9), no Reservoir help
   setting (Easy prefers a natural narrows among its candidates), the Dam site tool rebuilt as
   spurs, and running "no approximation of workshop maps" locally in each milestone's full check.
   Two measures need your call (REPORT.md §9): a higher default Variety (whole maps pass at 100 in
   River Valley), and whether the no-approximation floor may allow a share of maps below it, as
   the workshop maps themselves have.
4. Design version 2 follows once `investigation/landscapes` is ready; it folds in all three Codex
   investigations, and that is the version you approve.
