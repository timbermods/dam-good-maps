# High's soul: investigation

Base: `feature/high-look` at `8c975822` (includes the crisp tile boundary and anisotropy fix).
Reference source: `origin/dev` at `dd7bcbec`. No product source is changed by this investigation.

The largest improvement is **bright patterned tops against dark, jointed sides**, not lowering the whole frame.
The proposal combines warm/mauve cracked earth, olive flagstones with painted bevels, a narrow dark top lip,
stronger contact shadows, lime grass strokes, red contamination veins, orange ruins, and exposure **1.00 instead
of 1.22**. High also gets a wider navy/teal depth ramp, moving caustic networks, less white in falls, and clouds below
the map. Shared terrain, ruin and fall changes also apply to Standard.

[Pair overview](captures/pair-1.jpg) · [Pair close](captures/pair-2.jpg) ·
[Highlands fall](captures/highlands-fall.jpg) · [Lake badwater](captures/lake-badwater.jpg) ·
[Delta overview](captures/delta-overview.jpg) · [Standard](captures/standard.jpg) ·
[Colour-blindness](captures/accessibility.jpg)

The overview is fitted to four map corners (~1.5 px RMS at 1600 px); the close view is an approximation from four
terrain landmarks (~21 px RMS), not the game's unavailable saved camera. Baseline and proposal cameras are identical.
The known flat bottom-left quadrant is excluded from the assessment. References are comparison panels only.

| Region | Difference and remaining gap |
|---|---|
| Pair 1, upper/right terraces | Dark risers and the lip recover the stacked silhouette; warm/mauve patches replace grey. Texture repetition remains visible. |
| Pair 1, northern pool / eastern channel | Depth reads more strongly; the channel is still too uniform and lacks the game's complex flowing highlights. |
| Pair 2, left and right cliff faces | Large olive stones, mortar and bevels replace soft horizontal strata. They still look more graphic and less sculpted than the reference. |
| Pair 2, dry foreground / grass island | Crisp cracks and strokes survive the comparison scale. Grass is still too regular at some close distances. |
| Pair 2, falls / skyline ruins | Sheets keep their colour; ruins become orange/cream. Falls need richer longitudinal highlights; existing ruin geometry lacks rounded sacks. |
| Other references, badwater / poisoned banks | Dark red water, pink networks and orange veins are restored, including grass. Very dark water carries an accessibility trade-off; see READABILITY. |

**This is a direction proposal, not a claim of visual parity.** The procedural textures still need a more varied painted
finish; existing vegetation and start silhouettes remain visibly different. Badwater falls, a broad clean cascade,
and moving day-by-day contamination need dedicated adoption captures; the delivered map cases do not cover them fully.

Validation: baseline **120/120**, proposal **116/120** unit/contract checks; **11/11** browser checks and product-source
typecheck pass. The four reference-driven failures and additional High-water gaps are in
[READABILITY.md](READABILITY.md). No thresholds were weakened. Existing tests largely measure Standard's palette;
the additional High-water audit explicitly exposes the dark-water contrast gap.

Adopt through [INTEGRATION.md](INTEGRATION.md). It includes exact regeneration commands and every decision conflict.
Large builds, map/reference copies, raw captures and test JSON stay in ignored `local/`; only code, compact evidence
and this report belong in git. New patterns are original procedural code under the repository's MIT license.
