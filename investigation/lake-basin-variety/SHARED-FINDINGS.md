# Shared follow-ups, outside this patch

- `src/core/analysis/straight.ts` deliberately excludes broad-water shores (comments at
  lines 6–9; `channelWidth` default 9). All 30 baseline maps pass its channel limits,
  including the critique's visibly straight shores. Passing that check therefore does
  not establish natural lake shores. Keep the visual comparison as the shore verdict;
  no detector or threshold change is included here.
- Badwater's stepped/zigzag routes remain visible in the before/after sheet (for example
  seed 26). The critique already identifies this across themes. They come from shared
  hazard routing, not the Lake Basin catchment; that work remains separate.

- The final sheet shows badwater in part of seed 9's lake and most of seed 29's new
  lake (purple means settled contamination at least 0.05). Both pass readable water.
  The main lake therefore is not guaranteed clean by that outcome. Source admission,
  water mixing and the interpretation of the water reading are shared work; this
  observation does not isolate which policy should change. No shared fix is included.

No new shared-code failure is established by the final allowed outcome run. No shared
code is changed, and no cross-theme checks were run.
