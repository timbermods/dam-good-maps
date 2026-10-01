# Hand-back to M9b

**Do not adopt this prototype yet.** It improves the central catchment but fails the absolute and
speed requirements. No shared repair is included. REPORT.md separates those findings.

The candidate is `shapeLakeBasin` in [prototype.ts](prototype.ts): one area-scaled valley basin
near the centre, a radial catchment with less competing regional noise, fewer independent bowls,
and tributaries drawn by the existing drainage. The existing basin process makes ragged bays,
shallows and shores; the existing hydrology chooses the outlet. No lake or channel mask is stamped.
The elevation floor keeps more land above the water for the start. Nothing runs after land is shown.

If M9b chooses to continue the experiment, its insertion point is immediately after `leanGenome`
and before `makeField` in `generate`. The module hook exists only to run the investigation against
unchanged product files. Port the shaping function, not the monkey-patch runner. Reconcile it with
the settings leans before adoption: the batch tests defaults, not the weak-settings workstream.
Do not copy its numeric caps into other themes or Any's prior. Do not change the outcome thresholds.

Take only the investigation commit(s), not this branch's inherited `feature/m9b` history. Adoption
would need M9b's generator-version change and normal re-pin, living docs, release checks and
in-game parity verification. This investigation neither launches the game nor changes fixtures.

Checks here: all 60 original audit seeds and the same 60 prototype seeds through the real
generator/validator; repeated full `.timber` generation at seed 37 at all three sizes; unchanged
genomes for every other theme; strict TypeScript check. The newer-core comparison also checks
the same 60 seeds. A failed absolute is never excluded to improve the percentages.
