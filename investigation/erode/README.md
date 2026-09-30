# Erode: caves, overhangs and arches

An investigation of one force for Dam Good Maps: wind and water wearing rock. You sweep Erode along a cliff or
across a ridge, or click the rock, and the land decides what forms: a cave at a cliff's foot, an overhanging lip
where hard rock caps soft, an arch where a ridge is thin. Every result obeys the game's support rule, so nothing
it makes is dropped when the map loads. [REPORT.md](REPORT.md) has the pictures and the numbers.

![The moment on the crater case](captures/crater-moment.gif)

## Try it

Run `npm ci` once at the repository root (the demo uses its three and vite), then:

```sh
npm --prefix investigation/erode run demo
```

It prints a local address; open it in Chrome or Edge. Local only; nothing is installed or written elsewhere.

- **Click** rock to wear it where you click, or **drag** along a cliff or across a ridge. The stroke shows as you
  draw it; nothing predicts the result.
- The row: **Power** (how deep the rock wears), **Size** (how big the openings are; **Auto** follows Power) and
  **Try another** (a different result for the same gesture).
- **Esc** takes a playing erode back at once. **Ctrl+Z** undoes one erode, **Ctrl+Y** redoes it.
- Right-drag turns the view, middle-drag (or Shift + right-drag) pans, the wheel zooms, WASD or the arrows pan,
  Q and E turn. The camera never moves on its own; **Overview** and the low-view button move it when you press
  them.
- **Case** picks one of four places on real Dam Good Maps land at 128²; **Play this case** runs its gesture on
  its fresh land. **Sound** is on, quiet, with its switch at the top right.
- Water under the new roofs is an approximation until the water engine lands; the demo says so on screen.

## The files

| Where | What |
|---|---|
| `core/` | The force and the view's model, plain TypeScript: `terrain.ts` (terrain as runs), `erode.ts` (the wear, the hold, the order it's shown in), `support.ts` (the support rule for the planner), `mesher.ts` (the mesher and the light volume), `water.ts` (the water approximation under roofs), `map.ts`, `random.ts` |
| `demo/` | The page: `app.ts`, `view.ts` (three.js, in the Standard look's style), `effects.ts` (dust and rubble), `audio.ts`, `cases.ts`, `worker.ts` |
| `maps/` | The four maps as small fixtures (Highlands, the crater, Canyon, the tall map) |
| `audio/` | Four CC0 recordings ([ATTRIBUTION.md](ATTRIBUTION.md)) |
| `captures/`, `checks/` | What REPORT.md shows, and the measured numbers |
| `scripts/` | `check.ts` (the critical check), `captures.ts`, `maps.ts`, `survey.ts`, and a GIF and PNG writer |

## Commands

```sh
npm --prefix investigation/erode run check       # the support check on every case and 160 random gestures (~30 s)
npm --prefix investigation/erode run captures    # the stills, the GIF and the browser timings (~2 min, installed Chrome)
npm --prefix investigation/erode run maps        # rebuild maps/ from the generators (~30 s)
npm --prefix investigation/erode run typecheck
```

Large or throwaway output goes to `local/` (ignored). [INTEGRATION.md](INTEGRATION.md) says how Erode and the
mesher would be adopted on the forces core.
