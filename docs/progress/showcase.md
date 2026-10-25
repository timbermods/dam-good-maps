# Showcase mode (progress)

D488 (2), generation with intent: a mode the player asks for explicitly, allowed minutes, that searches for maps
with an arc and offers the best three; a probe batch then plays the winner to cycle 10 on both factions.

## The plan

1. **The core and its worker (this step, `feature/showcase`).** `src/core/gen/showcase.ts`: `arcOf` measures six beats
   on a finished map, `arcScore` ranks them, `showcaseSearch` makes the asked map's siblings in order (Another like
   this's `siblingSpec`: each its own share link, the map itself first) for the time allowed and keeps the best three
   that pass every absolute, never two on the same land, each with a note in a player's words. `tried` reproduces a
   search (`tries: tried`). `src/worker/showcase.worker.ts` runs it in a worker of its own; the messages are
   `src/worker/showcaseApi.ts`'s and `src/platform/index.ts` `createShowcase` starts it. No default map changes.
2. **The page's controls (the planning session):** asking for it, the minutes allowed, the progress (maps tried, the
   best three so far with their previews), the three offered with their notes, opening one (its `response.project`).
3. **The opening shot and landmarks steered into view (`feature/opening-shot`):** the core's frame of the game's
   first camera replaces this step's interim `openingFrame` in the vista and landmark beats.
4. **Ruins with meaning (`feature/ruins-meaning`):** a ruined dam across the natural narrows, a drowned village, a
   plugged tunnel to buried water, each with its own `say`; the mystery and project beats take them in.
5. **The probe plays the winner** to cycle 10 on both factions (D218, D483), and its results go into STATUS.

## The beats (step 1's measures)

Each is `{ met, strength 0–1, say }`, one small function, so a better measure replaces one alone.

- **An opening vista:** the ground the game's opening camera frames (60° pitch, turned the start's orientation × 90°
  + 35° clockwise from north; an interim trapezoid 14 tiles behind the start to 30 ahead): its relief, its open
  water, its tallest fall and its most prominent standing form (a form counts when its top stands up into the
  frame, `openingView`). Met with two of them and strength 0.6.
- **A first-drought choice:** the places to pump within 30 tiles' walk of the start, 8 tiles apart or more on
  whatever water (a river and the pool it runs through are two choices; `pumpPlaces`), each read on the water left
  after the generator's first drought (3 days). Met when some run dry and some hold; strongest when the nearest is
  the one that runs dry.
- **A valley behind a gate:** the intentions' hidden valley, farmland past a gorge or a district behind debris, or
  level farmland reached the long way round (1.8 times its distance on foot, 15–70 tiles off).
- **A late-game project:** a natural narrows a dam of 4–14 tiles closes over 1,000 blocks of water (at 128²;
  the checks' dam sites within 60 tiles), a plug holding back a lake, or a high lake.
- **A landmark in the colony's view:** a standing form 8 levels or more over its ring (`analysis/vertical.ts`
  `standingForms`), within 50 tiles of the start, its ground or its top in the opening frame.
- **A mystery:** a relic on a pinnacle, a cave (terrain above terrain), a plugged lake, a district behind debris, or
  a field of ruins on heights no beaver walks to (some mystery, not enough alone: it is on most rugged maps).

A feature two beats could claim counts in one: a plug holding back a lake in the project when the project has nothing
else, else in the mystery; a district behind debris in the valley when the valley has nothing else, else in the
mystery.

`arcScore` = the beats met + their mean strength (0–7); a map missing its theme's promise ranks one lower. Of two
siblings on the same land, the better one is kept. A search given `tries` makes all of them, whatever its budget.

## Numbers

Per candidate on the dedicated machine, with other builders running (PR #504): about 11 s at 128² (River Valley)
and 48 s at 128² under heavy load (Canyon); about 127 s at 256² (Highlands). So a few minutes makes 10–20 candidates
at 128² and 2–4 at 256². In the samples the first-drought choice is the rarest beat, and the vista and the landmark
are the commonest on rugged themes.

Beats met on 14 maps (every theme, seeds 1 and 2, 128², after the follow-ups of PR #504's review): vista 9, drought 5
(4 before: separate bodies of water, now places to pump with a real choice), valley 8, project 11, landmark 8,
mystery 3.
