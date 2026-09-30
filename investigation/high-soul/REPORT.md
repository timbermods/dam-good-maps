# High's soul: investigation

Base: `feature/high-look` at `8c975822`; references: `origin/dev` at `dd7bcbec`.
All work stays in this directory. Product source is unchanged; `adoption.patch` is for the milestone session.
Round 1 established warm brown/mauve earth, orange/cream ruins, red-orange veins and exposure **1.00**.
Kyler accepted these choices and the game's own readability trade-offs; no extra lightness gap or pattern is required.

## Round 3

- **Contamination:** sparse, irregular orange-red fissures with thick mains and thinner branches replace the fine net.
  No full-tile stain or distant orange fill; earth and grass keep their own colour between veins.
- **Cliffs:** unequal stone sizes, varied face slopes and soft mortar occlusion replace the uniform embossed bevel.
- **Clouds / channels:** fewer, larger cloud banks with clear openings; broader advected wave packets follow currents.
  Navy pools retain round 2's inputs and all four measured still-water sample statistics exactly.

The Badtide rendering path was checked with displayed-soil snapshots 0 → 128 → 255 → 0: veins alter only about **10–11%**
of the sampled earth/grass pixels, strengthen with contamination, then restore the clean image exactly. This exercises
`updateSoil`, used by the day view; it is not a full weather-simulation run. See [round3-checks.json](round3-checks.json).

Still short: a few vein junctions widen abruptly, cliff silhouettes remain flat, and rolling water remains procedural.
Palette, exposure, grass, falls and ruins are unchanged. The two pair sheets, ground-veins, highlands-fall and broad-cascade
are refreshed below; the other six sheets remain **round-2 evidence**. Tests remain **114/120** (the same six accepted-rule
conflicts), **11/11** browser checks and typecheck passing. Regeneration and adoption details are in INTEGRATION.

## Round 2 (historical findings)

- **Water:** broken, two-phase caustics and stretched highlights follow the existing estimated current; rough-water
  regions gain coloured crests. Pools retain navy depth, including grazing views. In the dedicated rendered study,
  deep clean water's median display luma is **31.2**, shallow **52.0** (0–255; sampled regions, not a universal margin).
- **Grass / repetition:** less yellow and bright; weaker, rotated, irregular blade strokes, darker mottling and
  macro coordinate warping break the atlas's obvious repeat. Large dry areas get the same varied sampling.
- **Cliffs / edges:** rounded stone relief, softer mortar and directional bevel shading; lighter level joints.
  Grass boundaries wobble within a narrow band and carry a thin dark rim, respecting equal-height neighbours.
- **Falls / sky:** more lengthwise threads and coloured highlights in clean and badwater sheets, little white;
  a blue horizon and smaller cloud patches remain visible in close views.
- **Ruins:** retained orange/cream and existing material grain. Convincing sacks need bulging panel geometry;
  thin rectangular panels cannot supply rounded silhouettes. The precise adoption follow-up is in INTEGRATION.

**Still short of the references:** cliffs remain more regular and embossed, with no geometric stone relief; channel
highlights are finer and more procedural than the game's broad rolling wavelets. Grass can still look stippled close
up; clouds are more evenly scattered. Block silhouettes, vegetation and the starting building remain different.
The new studies cover the missing fall/ground cases; day-by-day contamination scrubbing still belongs to adoption.

[Pair overview](captures/pair-1.jpg) · [Pair close](captures/pair-2.jpg) ·
[Highlands fall](captures/highlands-fall.jpg) · [Lake badwater](captures/lake-badwater.jpg) ·
[Delta overview](captures/delta-overview.jpg) · [Standard](captures/standard.jpg)

[Badwater fall](captures/badwater-fall.jpg) · [Broad clean cascade](captures/broad-cascade.jpg) ·
[Veins on earth and grass](captures/ground-veins.jpg) · [Colour-blind scene sheet](captures/accessibility.jpg) ·
[Clean/bad water and clean/contaminated soil in each simulation](captures/accessibility-cues.jpg)

Pair cameras are unchanged from round 1: overview corner fit ~1.5 px RMS; close landmark fit ~21 px RMS at 1600 px.
Baseline/proposal share cameras; the known flat bottom-left map quadrant is excluded. Dedicated studies use original
synthetic geometry, explicitly labelled; their game reference panels have different geometry. No reference is a texture.

Validation: baseline **120/120** (unchanged round-1 baseline), final proposal **114/120**; **11/11** browser checks and
product-source typecheck pass. The original four conflicts plus two grass gap rules are documented with exact adoption
replacements in [INTEGRATION.md](INTEGRATION.md). No product tests were edited. [READABILITY.md](READABILITY.md) records
information-only simulations and accepted limitations. Builds/captures have no browser errors.

Regeneration is in INTEGRATION. Large outputs, raw captures and reference/map copies stay in ignored `local/`;
only the report, code, small evidence and compact sheets are committed. All new procedural assets are original, MIT.
