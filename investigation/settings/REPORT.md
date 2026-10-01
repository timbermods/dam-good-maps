# Weak settings: prototype findings

**Nightly checks fixed; not ready for adoption.** Base: `feature/m9b` `6c29b7e5`.
Product code is unchanged. Independent patches, combined patch and reproduction: [INTEGRATION.md](INTEGRATION.md).

Verticality's pre-floor span was normalized under an almost fixed ceiling; river cuts added cliffs
at every value. It now owns the post-floor budget, scales incision and benches, retains Relief,
and provides more natural ramps. At 100, 27/35 maps reach 22; every theme reaches it. Lakes was
preset-relative, so Many added nothing on Lake Basin, while extra hollows overlapped, flattened
or lacked a feeding river. The prototype grows connected side basins on existing rivers, in
varied sizes, preserving signature lakes/seas at zero. No new sources, dams or theme priors.

Unchanged nightly checks, 96², seeds 1–8 / 1–12: cliff-share movement **−0.014 → +0.148**
(required +0.03); basin-count movement **+1.92 → +3.58** (required +3). All 40 prototype maps
pass validation. Relief, Highest terrain, Terracing and Buildable land also pass their checks.

Each patch alone: every theme, 128², seeds 1–5, values **0 / 25 / 50 / 75 / 100**. Means below;
held water is clean wet tiles in natural basins, including signature water. Complete per-step
validation, outcomes, cliffs, water and timings: [MEASURES.csv](MEASURES.csv).

| Theme | Relief, levels | Held water, tiles |
|---|---|---|
| Any | 3.4 / 5.8 / 7.8 / 12.2 / 12.4 | 12 / 552 / 630 / 737 / 878 |
| River Valley | 4.0 / 5.8 / 7.8 / 12.8 / 16.2 | 0 / 189 / 248 / 243 / 265 |
| Canyon | 3.8 / 6.2 / 7.2 / 12.8 / 16.8 | 28 / 50 / 142 / 311 / 337 |
| Highlands | 4.0 / 5.4 / 7.6 / 12.6 / 16.4 | 0 / 219 / 351 / 447 / 419 |
| Lake Basin | 3.8 / 6.0 / 7.4 / 13.6 / 15.4 | 907 / 1498 / 1446 / 1531 / 1520 |
| Delta | 3.4 / 5.8 / 7.6 / 13.2 / 16.2 | 80 / 933 / 1046 / 1151 / 1156 |
| Islands | 2.2 / 4.2 / 6.2 / 10.0 / 12.4 | 3990 / 4396 / 4421 / 4182 / 4203 |

**Remaining gates:** 172/175 Verticality maps and 171/175 Lakes maps pass production validation;
349/350 settle within D358's six days. Verticality fails Canyon seeds 2/5 at 100 (start) and
Islands seed 2 at 25 (settle). Lakes fails Any seed 1 at 100 and seed 3 at 50/75/100 (start);
the latter three regress passing categorical baseline cases. Failed maps remain in the sheets.
First maps meet all three outcomes on 100/175 and 119/175, unevenly by theme. Of 140 adjacent
seed/value pairs, relief fails to increase on 8 and held water on 26. Candidate changes can undo
the control's local gain; upper lake steps still compete with signature water. Settling a map
does not prove every basin is filled: per-basin wet fractions are retained locally.

Speed targets are missed in these shared-machine runs. At 128², median/p90 to first settled water:
Verticality **3.8/11.8 s**, Lakes **3.4/7.3 s** (target 2/5). A small combined-patch 256² sample
(each theme, seed 1, each control at 100): 14/14 valid, 7/14 meet all three; land **8.3/20.2 s**,
water **25.9/56.4 s** (targets 3/6 and 8/20). This is a diagnostic sample, not a speed certification.

Type-check, 1,010 range/protection/codec cases, three patch apply checks and 27 repeated valid-map
SHA-256 comparisons pass. Floors stay at 3, caps hold. No game probe. The sheets are generated
with the product renderer and visually checked: [Verticality](verticality-contact.png),
[Lakes](lakes-contact.png). Both are under 1 MB. Bulk maps, JSON and logs stay in gitignored
`local/`; INTEGRATION.md regenerates them. Adoption needs the failed starts/settle resolved,
reliable adjacent steps and speed brought within the targets; no thresholds were lowered.
