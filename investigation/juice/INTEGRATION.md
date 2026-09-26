# Proposed Live editing integration

This is a proposal for the milestone session, not an editor change. Port the
modules into the editor's own source tree when adopted; `src/` must not import
an investigation. Keep the garden and its demo server here.

The baseline is `dev` at `4f1b8c6`. The paused Live editing checkout also informed
these notes: it already has `src/editor/juice.ts`, `brushes.ts`, `carveDriver.ts`,
and `src/core/forces/force.ts`. These interfaces are WIP and should be checked
again when the milestone resumes. No other investigation or PR was reviewed.

## Where to connect it

Keep the existing `Juice` visual effects (`puff`, `wiggle`, `ripple`) and their
reduced-motion behavior. Replace its audio implementation with one `JuiceEngine`
for the editor's lifetime. Preserve the existing settings UI; do not add a
permanent sound panel to the map. Render/edit work never awaits audio.

| Existing place | Proposed sound hook |
| --- | --- |
| `Editor.tsx` creates/disposes `Juice`, calls `feel`, and updates `SoundSettings` | Own one engine here; use its `setSettings` and `dispose`. Preserve visuals even when sound is disabled. |
| `PainterHost.painting(on)` and `feel(kind,x,y,size,soft)` in `brushes.ts` | Reserve a stroke ID at painting start. Start the texture on the first **actual changed land**, then update it from `feel`. Read the selected brush to distinguish Flatten/Smooth/Naturalize; the existing `shape` name loses this distinction. End on `painting(false)`, cancellation, tool switch, pointer loss or blur. |
| Successful object/source placement callbacks in `Editor.tsx` | Play tree/berry/ruin/mine/start/water/badwater after the placement succeeds. All tree species share the wooden/leaf sound with fresh variation. Rejects and hover previews stay silent. Other shelf objects can use a material-appropriate mapping later; no new tools are proposed. |
| Dragging trees, bushes or Remove | One sustained tree/berry/remove texture for the gesture. Do not play one accent per tile, mirrored copy or entity. An optional first successful placement accent is enough. |
| Undo handling in `Editor.tsx` | Cancel the sound group of an active stroke/force immediately. Play `undo` once after a successful undo, not for an empty history or every internal reversal. Redo may reuse a quiet action accent once. Project loading and operation replay are silent. |
| `CarveHost.feel` / `show(ForceFrame)` in `carveDriver.ts` | Start one Carve texture after the accepted run begins. Update from the visible `head` (width, position, cut/activity), rather than retriggering `carveTouch` every few hundred milliseconds. Release on keep, drop, finish, pause, instant/skip or replacement. |
| Shared `ForceRun.step()`, `head`, `steps`, `done` in `core/forces/force.ts` | Keep the core deterministic and audio-free. Let the presentation adapter emit phase transitions from the **shown** force frames. Proposed new phase names below are not fields already present on `ForceHead`. |

The current `ForceHead.event` describes Carve (`surge`, `breakthrough`, `waterfall`,
`rock`, `split`, `rapids`, `oxbow`), so don't pretend it already exposes impact
or plume events. Add a small presentation cue adapter for each adopted force.
Quake Slide's sound does not change the decision holding that tool's adoption.

## API and units

```js
const juice = new JuiceEngine({ settings: { enabled: true, volume: 0.22 } });
// Invoke inside trusted pointerdown/keydown. The edit itself never waits.
void juice.unlock();

const p = { size: 0.35, strength: 0.4, distance: 0, pan: 0, activity: 1 };
const stroke = juice.start('raise', p); // null while locked/unavailable/off
juice.update(stroke, { ...p, strength: 0.65 });
juice.stop(stroke);
juice.play('tree', p);
juice.play('craterize', p, { id: 'force-12', phase: 'incoming' });
// On the visible impact transition, not a wall-clock timeout:
juice.play('craterize', p, { id: 'force-12', phase: 'impact' });
juice.stop('force-12'); // also cancels unplayed debris
```

- `size`, `strength`, `distance`, `activity`: normalized 0–1; `pan`: −1…1.
  Omitted values use size .35, strength .4, distance 0, activity 1, pan 0.
- Suggested diameter conversion: `size = clamp(log2(1 + diameterTiles) / 6, 0, 1)`.
  Normalize brush strength against the tool's range, including pen pressure.
  Force power uses its own creek-to-catastrophe slider fraction; force size uses
  its width/radius. Bigger events deepen, lengthen and increase the sound; power
  raises its energy. Catastrophes remain rounded and limited, never explosive volume.
- Compute event-to-camera distance in renderer world units, including elevation.
  Suggest `clamp((distanceWorld - 12) / 180, 0, 1)`, then tune with a real 256² map.
  Update active handles when the camera moves; derive `pan` from the projected
  horizontal position. The prototype uses smoothed gain and lowpass changes.
  Far gain is 1/8, with a much lower cutoff. Avoid a map-wide search each frame.
- `setDistance(0…1)` is a global additional distance used by the demo's zoom
  slider. In the editor prefer per-event distance updates; don't apply both to
  the same camera movement. Static accents keep their origin until they finish.
- Use `activity: 0` at a brush limit or while nothing changes. Updates are
  coalesced to one per handle per animation frame (at most eight pending handles).
  `play` admits an eight-accent burst and refills twelve accents per second;
  excess events drop immediately. Do not build a retry queue.
- Start once, update many times, stop once. IDs group layers for cancellation.
  A returned ID means the event was sent, not that it overrode voice limits.
  Every call is optional feedback: the edit must succeed independently.

## Force timing

| Force | Presentation cues |
| --- | --- |
| Carve | `start('carve')`, then `update` from the visible head, then `stop`. A continuous torrent/earth texture works at every simulation speed. |
| Craterize | `play('craterize', p, {id, phase:'incoming'})` on approach; `phase:'impact'` on strike. Impact includes the boom and staggered falling debris. |
| Quake Lift | `start('quake', p, id)` for rumble; `play('quake', p, {id, phase:'crack'})` at the fault; `stop(id)` when motion ends. |
| Quake Slide | Rumble/crack as above. Start `slide` under a separate grind ID while the land slides, update its activity, and stop both IDs together. A short `phase:'slide'` accent is also available. |
| Erupt | `start('erupt', p, id)` for sustained rumble; `phase:'plume'` on plume rise. Stop the rumble on cooling, then `play('erupt', p, {id:coolId, phase:'cool'})` for the hiss. |

Full `play('craterize'/'quake'/'slide'/'erupt')` recipes are for audition. Their
fixed timings are not a substitute for force transitions. Deduplicate by run ID
and phase; a worker may send several frames for the same phase. Cancellation,
Try another, undo and project replacement stop every associated handle, including
future accents. Pause stops textures; resume starts the current phase once.
Instant/skip shows at most one quiet completion accent, never a burst of history.

## Optional water ambience

Use at most two sustained groups: the nearest audible waterfall cluster and a
nearby moving stream. Take waterfall/flow data already computed for rendering;
don't scan the map or run water simulation for sound. Refresh their positions
and energy at about 5–10 Hz, coalescing camera updates. A still lake is silent.
Use `waterfall` and `stream`, low strengths around .3, and their distance/pan.
Fade a group via `activity` when it leaves view; `stop` it when no source remains.
Turning ambience off always releases both groups. Never enable it automatically
after a source placement, force, undo, reload or restored audio context.

## Defaults, lifecycle and adoption checks

- Proposed saved settings: `{ on: true, volume: 0.22, ambience: false }` under the
  existing `dgm.sound` key. Adapt `on` to the engine's `enabled`. Keep explicit
  existing off/volume preferences; only new users get .22. Old and new synthesis
  scales differ, so audition an existing .5 preference before migration.
  Clamp finite values and guard storage access. The demo resets on reload to make
  comparisons repeatable and does not write the editor's saved settings.
- The master switch covers action sounds **and** ambience. Zero volume is silent.
  Muting cancels voices; unmuting never replays missed edits. Reduced motion
  affects visual effects, not the user's independent sound preference. This demo
  has no autonomous decorative motion or flashing effects.
- Constructing/importing the engine creates no AudioContext. Initialize from
  the first trusted gesture and drop feedback during the small async worklet
  load. The demo awaits that load so its first explicit audition can be heard;
  the editor must not await it on the input/edit path.
- Pause on hidden/focus loss, stop active IDs and cancel presentation cues. The
  engine fades then suspends on visibility loss; the editor should also call
  `pause()` on blur. Resume only from a new gesture; no background sounds.
  Call `dispose()` on unmount. Unavailable Web Audio/worklet leaves editing usable.
- Host the two modules together via the app bundler's worklet URL handling over
  HTTPS or localhost. No worker, media or CDN downloads beyond these own JS files;
  no samples, recordings, decoded buffers, microphone permissions or licenses.
- The worklet preallocates 64 reusable voices, allows four sustained groups,
  reserves twelve slots for textures, and drops excess whole accents. It creates
  no AudioNodes or sample arrays while rendering. A 25 Hz DC blocker and smooth
  `0.82 * tanh(signal / 0.82)` limiter leave output below full scale. Gains and
  filter changes slew over 25 ms; stop fades over 110 ms.
- Run the numeric tests and browser checks here, then profile the adopted engine
  beside real 256² painting, water and each force. Check Chrome/Edge, Firefox and
  Safari on available hardware; rapidly mute, cancel, change tools, hide/restore
  the tab and switch projects. No blanket frame-time guarantee is inferred from
  a standalone demo. Listen at low volume over a long painting session before
  accepting the final mix.

When adopted, update EDITOR_PLAN, the Live editing progress log and the settings
documentation in that milestone PR. This investigation deliberately changes none
of those files and makes no release, merge or deployment proposal.
