# Drought and Badtide, day by day

> **State (2026-09-27; where a fresh session resumes).** Branch `feature/weather-days` (worktree
> `DamGoodMaps-weather`), from `feature/forces` (D265/D266, then D260 and the Select work merged in
> at d0b3e62) with `dev` merged in. Built: D267 as amended by D269, and D268. Held on the branch for
> Kyler's review and a preview sitting of its own after the forces' sitting; nothing merges into `dev`
> without his yes. Defaults the session chose: `docs/decisions-pending.md` #120–#123. Next: Kyler's
> sitting (checklist below); merge `origin/feature/forces` as its commits land and `origin/dev` daily.

Kyler's decisions: D267 (Drought and Badtide day by day; the Weather view folded in), D268 (Speed
belongs to the day strip alone), D269 (an edit ends the hazard view; D267's point (6), the live
update, dropped), with D265 (the camera never moves by itself) and D266 (the forces keep their own
pace). The rules: `investigation/cycles` (ported in `src/core/sim/weather.ts`).

## What was built

- **The everyday water bar** (D268): the status, Pause, Skip, Replay, Drought and Badtide. Its Speed
  control is gone; the water after an edit always plays at the one brisk pace (the old "normal":
  sixty frames a second, a small edit settling nearby in a second or two), and Skip goes straight to
  where it settles. `src/editor/waterPlayer.ts` lost its speeds and the old continuous weather run.
- **Drought or Badtide pressed** (D267 (1)): the strip opens at once and the status says "Working
  out the drought… 40%" while the editor's worker works it out (it never freezes the page); each day
  is shown as soon as it is ready, and the view lands on the last day with its soil (dried or
  contaminated ground). On most maps that is under a second or a few; on slow ones the drought
  unfolds meanwhile, and a player who picks a day takes over (#124). Pressed again, the map's own water and soil come
  back at once. The worker (`showHazard`, `src/worker/session.ts`) first lets the water after the
  last edit settle, then runs the game's weather rules from the map's own water (`HazardRun`,
  `src/core/sim/hazard.ts`): a drought stops every source and the water drains and evaporates; a
  badtide turns every clean source bad along the game's curve, tick by tick. It keeps each day's
  water and soil and a few frames within each day.
- **The day strip** (D267 (2)): on the water bar's own line while a hazard is shown: previous, Day 0
  (the map as it is) to the last day, next, **Play days**, **Speed** (slower, normal, faster,
  instant; only here) and **Days**. Stepping to the next day plays that day's water moving at the
  speed (`src/editor/dayPlayer.ts`, blending the worker's frames); Instant jumps and stays; nothing
  goes back on its own. Pause holds a step, Skip finishes it (while playing: straight to the last day).
- **Length** (D267 (3)): 1 to 30 days per hazard, defaults Normal's longest (drought 9, badtide 8),
  remembered in the browser with the Speed (`src/editor/hazardPrefs.ts`); a new length works out the
  hazard again and shows its new last day.
- **The start's water** (D267 (4)): its lakes and rivers get a white edge and a faint tint while a
  hazard is shown (`startWater`, `src/core/analysis/startWater.ts`, the start's own water rule); the
  marked day's button is ringed, with its words at the strip's end ("Day 6: your start's water is
  gone"; "Day 1: badwater reaches your start's water" or "…its farmland"), or, with no marker, "Your
  start's water lasts the drought", "No water a pump reaches near your start" or "Badwater doesn't
  reach your start".
- **Any water** (D267 (5)): the hover readout adds, for water that was there on Day 0, "Dry on day 6",
  "Lasts the drought", "Turns bad on day 2", "Stays clean" or "Badwater already"; its depth and soil
  are the day's on screen.
- **An edit ends the view** (D269): a stroke as it starts, an undo or redo, a force, a placement or
  removal, a Select action: the view ends at once (the worker drops its days), the map's own water
  returns and the edit's water plays as usual. Pressed again, the button works out the new land.
  Nothing of D267 (6)'s live update was built.
- **The camera** never moves (D265); the e2e test checks the view is unchanged after a whole visit.
- The Weather view step (D133, D285) now builds on these buttons; the retired term "weather run"
  (the old continuous run) is in `tools/retired-terms.json`.

## Tests

- `tests/unit/hazard.test.ts`: a length of 3 is three days with their frames, and the last day is one
  continuous run's water; lengths clamp to 1–30; each tile's dry day and its words; a badtide's
  clean source turns bad on day 1 (the map's own source untouched); **the start's marker falls on the
  day its water leaves a pump's reach** (checked against an independent run of the same water); the
  badtide marker.
- `tests/unit/dayPlayer.test.ts`: **at Instant a step jumps and stays on the day**; at normal speed the
  water moves over the step then stays; back or a click further on goes straight there; Pause holds,
  Skip finishes; Play runs in order and stops on the last (from the last, from Day 0); Play at
  Instant, and Skip while playing.
- `tests/contract/hazard-days.test.ts`: in the editor's worker, Day 0 is the map's own water, the
  frames of a day end on the day, progress is told from 0 to 1, **an edit ends it**, and shown again it
  is the new land's; a newer request drops an older one.
- `tests/e2e/weatherDays.spec.ts`: **clicking Drought shows the last day, and clicking it again the map's
  own water**; the strip steps day by day and **at Instant a step stays on its day**; Pause and Skip on a
  step; hovering water says when it dries; **a length of 3 shows a three-day strip**, remembered with the
  Speed; Badtide's last day; the camera unmoved; **an edit while day 9 is shown returns the map's own
  water at once, and Drought again shows the last day on the new land**; a stroke ends it too.
- Updated per D148 (the decision made them stale): `waterFlow.spec.ts` (**the water after an edit plays
  at the one brisk pace with no speed control on the bar**; the old continuous drought and badtide
  run it also played is gone, replaced by `weatherDays.spec.ts`), `waterView.spec.ts` (the bar's
  Speed default and Instant → no speed control on the bar), `forces.spec.ts` ("a force keeps its own
  pace whatever the water's speed" → whatever the day strip's Speed, set on the strip), and
  `brushSources`, `select`, `unleash`, `sounds` (they set the bar's Speed to hurry or slow the water;
  the line is gone).

## Measured

The time to show the worst day (the click to the last day in hand), `tools/bench-hazard.ts`, in Node
on this machine (the browser's worker runs the same code), while M9a's batches share the machine:

| Map | Drought, 9 days | Badtide, 8 days |
|---|---|---|
| 256² River Valley, seeds 1–3 | 3.8, 2.9, 1.8 s | 21.8, 14.0, 14.2 s |
| 128² Canyon, seed 1 | 0.4–0.6 s | 2.9–5.4 s |
| 128² Highlands, seed 1 | 0.8 s | 4.6 s |
| 128² Delta, seed 1 | 3.0 s | 19.9 s |
| 128² Lake Basin, seeds 1–3 | 23.9, 20.2, 15.7 s | 28.3, 15.6, 19.1 s |
| 128² Islands, seeds 1–3 | 18.8, 48.1, 21.6 s | 33.7, 46.1, 27.8 s |

The cost is the game's water rules themselves, every wet tile every tick for 768 ticks a day: the
plain simulation of a 9-day drought on 128² Islands seed 1 took 22.8 s alone, the whole
working-out 20.1 s (the frames and each day's soil add little). A badtide keeps every source running,
so its rivers stay wet; a drought is quick where rivers drain and slow where big lakes stand. On 256²
maps with big lakes, expect roughly four times the 128² figures. Mitigation built (#124): the strip
opens at once and the view follows each day as it is worked out, so a slow map shows the drought
unfolding instead of a stalled percentage. The simulation speedups adopted in D130 (on
`feature/m9a`) will shorten every case once they reach `dev`.

What the markers said: River Valley, Canyon, Highlands and Delta starts draw on rivers, which drain
in the first day of a drought ("Day 1: your start's water is gone") and turn bad in the first day of
a badtide; Lake Basin and Islands starts keep their lake through a 9-day drought ("Your start's water
lasts the drought"), and badwater reaches their water or farmland on days 1–3.

## For Kyler's sitting

1. Refine a map (a 256² one too), press **Drought**: progress, then day 9 with the dried ground; the
   start's lakes and rivers have a white edge; the strip's end says what happens to the start's water.
2. Click days, **‹ ›**, **Play days** at each Speed; Pause and Skip on a step. Does a day's water
   moving read well at Normal (1.2 s a day)? (#120)
3. Hover water: "Dry on day 6" / "Lasts the drought". Per tile the right answer, or would you rather
   one answer for the whole lake? (#122)
4. Change **Days** (try 3 and 30), then Badtide: the day badwater reaches the start's water or farmland.
   Is the marker's meaning what you wanted? (#121)
5. With day 9 shown, paint, place a source, run a force, undo: the map's own water at once each time;
   Drought again shows the new land.
6. A map with a big lake (Lake Basin, Islands): the days appear one by one while it is worked out,
   then it stays on the last. Better than waiting on the map's own water with a percentage? (#124)
7. The water bar has no Speed: an edit's water always flows at the one brisk pace, Skip when wanted.
