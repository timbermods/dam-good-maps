# Readability evidence, round 2

Round 3 retains these readability decisions and the two round-2 CVD sheets. Its six test conflicts are unchanged;
`round3-checks.json` adds sparse-vein and displayed-soil clearing evidence without any new CVD rule.

Kyler's round-2 decision supersedes the earlier request for extra lightness gaps or an additional badwater pattern.
Match the game's cues: pink caustics, bubbles, red contact at rock, and orange-red contamination veins through grass
and dry earth. The dark High-water trade-off is accepted. The sheets are information, not accessibility certification.

The unchanged look/brush/highLook unit and contract suites produce **114 passed / 6 failed**; the unchanged baseline
was **120/120** in round 1. Browser look/render3d tests: **11/11**, none skipped. Product-source typecheck passes.
Full output stays in `local/tests-proposal.json`, `local/e2e.json`; compact results are in `checks.json`.

| Unchanged assertion conflict | Round-2 result | Adoption |
|---|---|---|
| Cool-only dry earth | Warm R–B .195, old limit .17 | Pin warm/mauve inputs. |
| Muted ruin skeleton / panels | Orange `#d4781f`, old `#8d5631` | Pin orange/cream; retain model checks. |
| Contamination layer's wet/dry lightness gaps | First gap .157, old minimum .2 | Retain coverage/response checks; test the game's visible vein cues. |
| Meanings apart in greyscale | Grass–wet-vein .188, old minimum .3 | Replace cross-material gaps with semantic and depth checks. |
| Ordered meanings in lightness (new conflict) | Grass .501, old required > .517 | Less neon grass; retain unrelated tree/marker checks. |
| Every grass vs every dry patch in CVD (new conflict) | First L* gap 7.69, old minimum 10 | Informational measurements, no mandatory L*/Lab gap. |

[INTEGRATION.md](INTEGRATION.md) specifies each replacement, including assertions after the first failing line.
Other geometry, simulation-byte, water-flow, marker, brush, and shader-structure checks pass. Passing old Standard
palette tests do not certify High's rendered contrast; several still encode superseded gap rules and should be reclassified
at adoption even though they currently pass. No thresholds or product tests were edited in this investigation.

## Rendered evidence

[Targeted sheet](captures/accessibility-cues.jpg): water is clean left / bad right, shallow back / deep front; ground is
dry left / grass right, contaminated back / clean front. Each row has colour, greyscale, deuteranopia, protanopia and
tritanopia. [Scene sheet](captures/accessibility.jpg) keeps round 1's five scene rows. Machado severity-1 matrices are
applied in linear RGB after rendering. Thin veins lose contrast when downscaled; dark clean/bad pools can converge.
There is no added hatching or enforced brightness separation. Existing optional Markers remain available.

The deterministic water study's 25×25 screen samples have median display luma **31.20 deep clean / 52.00 shallow clean**,
and **33.96 deep bad / 40.17 shallow bad**, on a 0–255 scale. `capture-fixtures.mjs` checks only that deep clean water
renders darker than shallow clean water. Coordinates and 5th/95th percentiles are in the ignored fixture manifest and
summarized in `checks.json`; they are specific scene samples, not a perceptual threshold or a clean/bad ordering rule.

`high-water-audit.json` retains the palette-input audit before alpha/light/grade: clean shallow-to-deep span is 18.45 L*
(normal), while deep clean-minus-bad is −3.46 L* (−6.17 deuteranopia, 1.31 protanopia, −2.89 tritanopia). That accepted
trade-off is unchanged. New badwater-fall, broad-cascade and soil studies fill round 1's missing static cases; the
milestone still needs to verify the same veins while scrubbing displayed Badtide days. No extra contrast rule is proposed.
