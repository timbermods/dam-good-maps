# Hand-back to M9b: Round 2

**Held for adoption:** the 1–20 outcome batch meets the requested composition/pass rates, but
M9b's speed targets are not demonstrated. The additional 128² seed 37 also needs D350's
143-tile post-display outlet wear; the strict unchanged-land verification therefore fails.

Use [REPORT.md](REPORT.md)'s final verdict before adopting. The current candidate is
[round2.ts](round2.ts); [adoption.patch](adoption.patch) is its pure shaping function plus a call
immediately after `leanGenome`, before `makeField` and before any land is shown. Product files
were never edited. Do not port the investigation module hook or alter shared outcome checks.

One area-scaled valley basin replaces competing bowls; its irregular bays and side valleys
come from the existing field process. A stronger radial catchment and restrained regional noise
bring several existing drainage tributaries into it. The large-map lake is smaller, with a
curved outlet valley made by the existing trough process. Existing hydrology chooses the actual
river courses and exit. Its bounded load and narrower river floors avoid spreading water over
land. The elevation floor leaves practical starting land.

The patch deliberately covers only **default Normal, single-colony, unconstrained square Lake
Basin maps from 96² through 256²**, with no explicit intentions. Custom settings, difficulties,
sizes, colonies and regeneration contexts keep the shared path. This leaves the weak-settings
workstream independent. Reconcile those paths explicitly before broadening adoption. Other
themes and Any's prior are untouched; no settings targets or water caps are relaxed.

Regenerate the patch with `python investigation/lake-basin/make-patch.py`; it builds the diff
in memory. On the merged `e292cefe` base, dry-check it with
`git apply --check --ignore-space-change investigation/lake-basin/adoption.patch`.
The patch's new module is `src/core/land/lakeBasin.ts`. Its guard fails closed outside the tested
domain. Do not apply Round 1's `prototype.ts` instead.

Take only this investigation's non-merge commits. The shared merge and inherited M9b history
belong to M9b already. Adoption needs M9b's generator version, re-pin, living docs and normal
in-game parity/eye checks. No game was launched, fixtures changed or shared repairs included
in the shaping patch. Regeneration, outcome diagnostics and contended timings are in
[README.md](README.md) and the `round2-*` evidence files.
