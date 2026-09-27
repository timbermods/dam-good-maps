# Glaciate — Round 3: a mountain carver

A glacier investigation for Dam Good Maps, including Kyler's follow-up: **no relief refusal, gesture-selected Flow/Aim, swept objects and absorbed clean springs**. Broad shallow rivers replace the old deep slot and collector ditches. The visual and land-gain targets are still not reliably met; see the actual pictures and measurements in [REPORT.md](REPORT.md).

From the repository root, with Node 22 or newer:

```sh
npm --prefix investigation/glaciate run demo
```

The launcher installs this folder's locked dependencies on first use and prints a free loopback URL. Open it in Chrome or Edge. No game files, API key or repository-wide install is needed.

**Click for Flow; drag for Aim.** Ice begins gathering on pointer-down. Moving six pixels changes the pending gesture into Aim and shows only a thin straight arrow; release starts the cut. Clicks follow drainage. On locally flat terrain, a seeded choice seeks lower ground or an edge; Try another can change that direction. No relief test refuses a gesture.

The row contains **Power, Size with Auto, Meltwater, and Try another**. Auto Size follows Power (30 at Power 60). Try another starts from the original map and gesture, keeping the mountain drainage route while varying morphology. Right-drag orbits, middle-drag pans, and the wheel zooms. Valley view looks uphill from the new floor. Reset view returns to the overview.

Three seconds of travelling ice are followed by two seconds of retreat. Terrain finishes during advance; water may settle later. **Esc cancels; Undo restores the whole event**, including objects, start, water and waterfall meshes. Redo and saved studies assign the literal recorded result. Sound and Motion controls are outside the force row; reduced motion is respected.

Trees and objects in the affected path are removed. Surviving objects keep their coordinates. Clean sources swept by the glacier feed its cirque source; badwater strength is discarded. Their flow can still choose a different outlet and dry the old downstream course, a remaining failure. Meltwater off creates no replacement source or retained water, though untouched outside rivers can still enter the result. An affected start moves to the nearest unoccupied level 3×3 ground outside the trough. No access or resource repairs are made.

| Map | Click or drag, x/y | Evidence |
| --- | --- | --- |
| Canyon 10, 128² — default | Click 22,22 | Hero; also crosses the original start |
| Highlands 7, 256² | Click 150,20 | Hero and large-map timing |
| Tall VT85 study, 128² | Click 36,92 | Tall walls; weak hanging falls |
| Canyon 10, 128² | Drag 22,22 → 98,96 | Ridge crossing |
| River Valley 18, 128² | Click 32,32 | Flat-ground glacier |
| Highlands 7, 256² | Click 61,222 | Actual level-15 spring becomes the new river head |

Save study / Open study use a prototype JSON format. Download .timber writes actual terrain, entities and displayed water with the repository writer. The editor can report an unsuitable relocated start; such findings do not veto the force. No Timberborn launch has been performed.

Standard fixtures are snapshots from the actual editor generator. The tall heightfield is unchanged from Round 1's generator pre-build: the dev editor has no Verticality control. Its loader adds one ordinary start on existing flat ground to test the one-start contract, without terrain, resources or access repairs. Gallery maps remain unchanged. [Attribution](ATTRIBUTION.md).

```sh
npm --prefix investigation/glaciate run typecheck
npm --prefix investigation/glaciate test
npm --prefix investigation/glaciate run build
npm --prefix investigation/glaciate run captures
npm --prefix investigation/glaciate run report
```

Run `test` before `captures`: it saves large endpoints in ignored `local/results/`. Captures requires installed Google Chrome. It measures every browser run without screenshot encoding and checks its endpoint against Node before recording images. `report` uses those records. `maps` regenerates the fixture snapshots. The optional hero scan is separate from the unfiltered random sampling in `tests/cases.ts`.

All changes are confined to this folder. Older evidence remains in Git history. [INTEGRATION.md](INTEGRATION.md) describes a possible port, not a merge or adoption instruction.
