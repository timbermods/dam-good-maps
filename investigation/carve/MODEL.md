# Force model notes

This is an exaggerated editing tool motivated by fluvial processes, not a
calibrated landscape forecast. It replaces the earlier passive erosion model.

A continuous head moves 1.35 tiles every two steps. Its heading favors inertia,
downhill look-ahead and material it can overcome; Aim adds curved destination
guidance. Low Power pays more energy for rising hard ground. A finite travel
budget and explicit lake/edge/destination/resistance endings bound a run.
The brush follows a non-increasing floor, revealing cuts locally. Power sets
its default width and depth. A width override concentrates or spreads cutting
work by sqrt(default width / width). Low effective work caps per-tile incision,
including overlapping brushes. Trailing bank work makes a gorge or terrace.

Wander controls the amplitude and wavelength of a lateral swing around an
independent guide. Aim points toward its endpoint; Unleash follows the M9
drainage field. A fixed 110° bound applies at every Wander value. Momentum
scores candidate headings inside that bound, rather than accumulating turns.
Eight stalled moves trigger straightening; every rolling 16-move window must
improve endpoint distance or downstream potential. A blocked advancing route
ends the force as power spent. Old path segments cannot be crossed.

At high Wander, a long single bend with a narrow neck can receive one cutoff.
A route-only look-ahead reserves transverse mouth bars at both ends. Scour
and sediment infill combine in the same step, with explicit sediment thickness
and gross debris accounting, so the exposed ground never reverses direction.
This approximation preserves the no-flicker rule. A lower shortcut and the
scoured crescent leave an isolated basin behind those two bars.

The lake inherits water produced by the repository's pre-closure solve.
Then WaterSim and SettleRun run on the final terrain, with the real source,
normal evaporation and unchanged convergence test. This history-aware solve
is necessary because a fresh canonical solve starts an isolated basin empty.
Only the disconnected lake component retains earlier water; other tiles use
normal prefill. It has no hidden source or fixed level. An evaporating lake
can reach the usual four-day solve limit while still wet; preserve that
settled=false result. A dry canyon never adds retained oxbow water.

Bend curvature is measured over six stations. It moves the cut bank outward,
widens the bend and scours up to two extra levels on the outside. Inner banks
retain whole-level shelves; straights contract. The same lanes feed VFX.

The personality seed chooses smooth width and swing phases plus pool/rapid/fall
spacing. These use distance and forward progress, never wall time. Extra
winding length has a finite travel budget. Every source, terrain, object and
water change remains part of one literal result operation.

A separate hash of the original map fixes geology. Wider reaches can fork
around multi-tile competent rock cores, then rejoin. The two lane brushes
share their bed grade but retain the core and the one-direction rule. This
is an exaggerated anabranching reach, not full dynamic island formation.
The original map and settings stay fixed across re-rolls; only the recorded
unsigned 32-bit seed increments. Whole-result history never uses that seed.

Whole-level work accumulates fractionally. Hardness scales channel work by
1 - 0.85h and bank work by 1 - 0.8h, matching the M9 v2 field.ts coefficients.
The default geology is four-level horizontal beds, offset by a deterministic
hash of the input heightfield. An optional map rockLayers array overrides it.
Coherent beds, bank targets and rejection of new isolated extrema keep the
surface ordered. The terrain can change only in its first chosen direction
during a run.

The carried debris budget counts every excavated block. At the receiving end,
a widening fan fills untouched adjacent ground by whole levels, leaving its
central channel open. Deposits cannot be recut in the same run. Fine load
that does not form terrain stays diagnostic; it exits only at a map edge.
This is a lumped transport model, not a sediment concentration solver or a
complete alluvial transport or bank-migration model.

The head and muddy ribbon preview the force. WaterSim advances existing water
as the floor changes. The final source is a real Timberborn source. Its strength follows
nominal Width (D199); linked Width preserves the default Power relationship;
ordinary runs use canonicalRun; sealed oxbows use the two-stage repo solve
described above. A dry canyon omits the new source. Exact history stores results,
so future changes to this algorithm cannot change replay.

M9 v2 was read only at c77026b271519290ab6dd9b4a9c29890e822fd2f:
field.ts, levels.ts, hydro.ts, terrain.ts and REPORT-v2.md under
investigation/generative/v2/, plus docs/m9-design.md. We share resistance and
landform principles, not its complete offline stream-power solver.

Background:
- [Braun and Willett, 2013](https://doi.org/10.1016/j.geomorph.2012.10.008), the stream-power method cited by M9.
- [Hergarten, 2020](https://esurf.copernicus.org/articles/8/841/2020/), transport-limited erosion.
- [USGS meanders](https://www.usgs.gov/educational-resources/find-feature-meander), bend erosion and deposition.
- [USGS fluvial sediments](https://www.usgs.gov/publications/fluvial-sediments-a-summary-source-transportation-deposition-and-measurement-sediment), sediment transport and deposition.

These sources motivate the processes; they do not validate this prototype's
coefficients or game-scale outcomes.
