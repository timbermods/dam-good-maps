# Glaciate

A valley glacier investigation for Dam Good Maps. All changes live in this folder.

From the repository root, with Node 22 or newer:

```sh
npm --prefix investigation/glaciate run demo
```

The launcher installs this folder's locked dependencies on first use and prints a free loopback URL. Open it in Chrome or Edge. No game files, API key or repository-wide install is needed.

**Flow:** click high ground. A faint hover line previews the existing drainage corridor. **Aim:** drag from the head to the end of the pass. Right-drag orbits, middle-drag pans, and the wheel zooms. Top view makes precise placement easier.

The options row has Mode, Power, Size and Meltwater, plus **Try another**. Size follows Power while Auto is pressed; touching its slider sets a manual width. Auto restores the link. Try another uses the same original land and gesture with the next seed; it does not stack glaciers.

The normal animation is three seconds of advance and two of retreat. A real water settle can continue afterwards; the status says when that happens. **Esc cancels; Undo restores the entire event, including trees and water.** Redo and saved studies assign the recorded result without rerunning the glacier. Sound and Motion switches sit outside the options row. System reduced-motion preferences are respected.

**Save study / Open study** use a prototype JSON format, not a production project format. **Download .timber** writes the current terrain, actual entity positions and displayed water through the repository writer. It does not launch Timberborn. Keep/cancel a running force before exporting. The game continues normal water simulation after loading.

Try these gestures (tile coordinates, x/y; Top view helps):

| Map | Gesture | Purpose |
| --- | --- | --- |
| River Valley 18, 128² | Flow at 64,16 | Default stepped lakes |
| River Valley 18, 128² | Flow at 32,32 | Flat-ground lobe |
| River Valley 18, 128² | Aim from 28,80 to 97,35 | Pass through the range |
| Highlands 7, 128² | Flow at 64,96 | Existing tributary crossings |
| Highlands 7, 256² | Flow at 208,112 | No room to deepen |
| Highlands 7, 256² | Flow at 80,112 | Large-map performance case |

Generated map files are reproducible snapshots of the actual `dev` editor generator. The tall VT85 case is explicitly a **generator pre-build study**: the fetched editor does not yet expose Verticality. It has no playable start, so use Save study; its .timber download is refused. The three available requested gallery places are selectable; River Coe is absent from the fetched gallery. Neither gap is hidden with an invented fixture.

```sh
npm --prefix investigation/glaciate run typecheck
npm --prefix investigation/glaciate test
npm --prefix investigation/glaciate run build
npm --prefix investigation/glaciate run captures
```

`captures` needs installed Google Chrome. Run `test` first: it saves large result maps in ignored `local/results/`, which the browser capture harness reads. Captures first build a **read-only comparison oracle** from the pinned Round 2 `feature/forces` commit (`cd9225c`, required in the local Git object database; `git fetch origin feature/forces` supplies it on a fresh clone). That oracle lives under ignored `local/` and is never imported by the demo or Glaciate implementation. It sets Carve to Width 24, Depth 12, Power 100, Steep walls and Wander 5.

The harness opens its own local server, captures the real renderer, and measures performance in a separate run without taking screenshots. `run maps` regenerates the six committed terrain inputs. Source-selection scans and all large temporary results stay in ignored `local/`.

Read [REPORT.md](REPORT.md) for the findings and limitations, [INTEGRATION.md](INTEGRATION.md) for adoption proposals, and [ATTRIBUTION.md](ATTRIBUTION.md) / [bank.json](bank.json) for asset provenance.
