# Dam Good Maps

A map generator for [Timberborn](https://mechanistry.com/). Pick settings, generate a map, see it
in the browser and download a `.timber` file that loads and plays in Timberborn 1.1.

The website is in progress, following [ROADMAP.md](ROADMAP.md). Once Pages is on, it is served at
<https://timbermods.github.io/dam-good-maps/>.

The generator:
- Pick **Any**, or a theme to lean toward: **River Valley**, **Canyon**, **Highlands**, **Lake
  Basin**, **Delta** or **Islands**. Then pick the size and the difficulty.
- The land and its rivers grow from uplift, erosion and flowing water. **Terrain → Verticality**
  makes it taller and sheerer. From 70 it can rise above level 16, which the game's map editor
  can't edit.
- Open **Terrain**, **Water**, **Hazards**, **Resources** or **Advanced: start rules** to change the
  map. Each setting shows what the official maps use.
- **Generate** makes the map. Its water is settled by the game's own rules, and it is checked for a
  colony's survival.
- Every map's start has clean water within a short walk, using only the map's own slopes. Wood and
  berry bushes grow nearby. The map card lists the **Start requirements**. **Advanced: start
  rules** sets them.
- The preview shows water, moisture and reach layers. **3D** shows the map in 3D. The ground looks
  as in the game: green where the soil is moist, cracked earth where it is dry, rusty red where
  badwater spoils it.
- Trees, berry bushes and ruins come in about the amounts official maps of that size have. They
  grow in groves, patches and fields. Every map has at least one mine site and one badwater
  source. For a peaceful map, set **Badwater** to **No badwater**.
- **Copy link** gives a link that opens the same map. It carries the settings, not your edits.
- **Save to Timberborn** puts the map straight into the game's custom maps. The first time, pick
  `Documents\Timberborn\Maps`; after that it is one click (Chrome and Edge). A map with the same
  name is kept, and the new one gets a number: `dgm-river-valley-7-2.timber`.
- In other browsers it downloads the `.timber`: move it to `Documents\Timberborn\Maps`.
  **Download project file** keeps the map for editing later.

The editor:
- **Refine this map** opens the map in 3D. Drag to turn the view, right-drag to move it, scroll to
  zoom. WASD and the arrow keys move, Q and E turn, Shift is faster.
- Paint the ground with the brushes at the top: **Raise**, **Lower**, **Flatten**, **Smooth** and
  **Naturalize** (keys 1–5). Drag on the map to paint.
- { and } size the brush, or hold F and move the mouse. Hold F and scroll, or press [ and ], to set
  **Smooth** and **Naturalize**'s strength. Shift while painting swaps Raise and Lower. Esc cancels a stroke.
- **Raise**, **Lower** and **Flatten** work like the game's editor. They take the ground to the level
  shown beside the pointer, with hard edges.
- Shift+scroll or Ctrl+click on the land sets that level; Esc lets it follow the ground again. Past
  either end, **Free** raises or digs softly.
- The row under the brushes holds their options: **Size**, **Level**, **Mode** and **Sources**, then
  **Square** and **Straight lines**. **Flatten** adds **In steps**.
- **Mode**: **Ground** leaves water alone, **Water** changes only the ground under it, **Both**
  changes everything.
- **Sources**: **Ride** moves them with the ground, **Keep** leaves them where they are, **Clear**
  removes them.
- **Level lines** is a view switch beside **Height colours**. A slope goes exactly where you want it
  from the shelf's **Slope**.
- A **Lower** stroke that starts in or next to water carves a bed the water follows. Its ring turns
  blue.
- The forces reshape the land in one gesture: **Carve** (7) a river, **Craterize** (8) an impact crater, **Quake** (9)
  a fault, **Erupt** (0) a volcano, **Glaciate** (-) a glacial valley. Click the map, or draw a path, a fault or a loop.
- Each force has **Power**, and all but Quake a **Size**: hold F and move the mouse for Size, hold F and scroll or press [ and ] for
  Power. **Try another** gives a different result; **More** holds the details.
- **Slow forces** plays a force out slowly. Esc skips it to its end, and Ctrl+Z takes it back.
- The shelf on the left places things: **Start**, **Water source**, **Badwater source**, trees,
  bushes, ruins and more. Pick one, then click the map. Green means it fits; red says why not.
- R turns the object, and Esc puts it back. Drag with a tree or bush to plant a grove.
- A new source's water flows at once. The row under the brushes sets its strength.
- Over a placed source, Ctrl+scroll sets its strength. Drag it to move it. Click it to change or
  remove it.
- Point at an object or a source and press **Delete** to remove it. The start stays.
- **Select** (M) marks an area, as does Ctrl+drag with a brush. Raise it, lower it, level it or dig
  it out. **Delete** clears everything standing in it.
- Drag the start to move it. Point at it to see its water, wood and berries.
- The water flows as you edit. **Pause**, **Speed**, **Skip** and **Replay** control
  it. **Drought** and **Badtide** show what each does to the map.
- A brush over water clears the water around it, so you see the bed. **Clear water** (T) clears all
  of it.
- The buttons over the map: **Top-down**, **Height colours**, **Markers**, **Badwater**,
  **Minimap** and **Sound**.
- Alt+scroll hides the levels above a layer, as in the game. Alt+click jumps to a tile's layer.
- Ctrl+Shift+1 to 9 keeps the view; Shift+1 to 9 goes back to it.
- Ctrl+Z undoes and Ctrl+Y redoes. Each stroke or placement is one step.
- The dot at the top is green when the map is ready to play. Amber means something to look at:
  click it for the list and the fixes.
- **Save to Timberborn** saves the map into the game (**Download .timber** in other browsers). The
  **⋯** menu has **Open…**, **Save project**, **History** and **Back to settings**.
- **Back to settings** keeps your edits. **Generate** makes a new map; yours stays saved, and
  **Back to editing** returns to it.
- **Open a map** opens any `.timber` from Timberborn 0.6 to 1.1.

Your map is saved in the browser as you work.

Real places:
- **Real places**, at the top of the generator, lists 85 maps made from real land. Each is inspired
  by the land near its namesake, at Timberborn's scale. It is not a replica.
- Filter by **Landform** and size. **Save to Timberborn** puts the map in the game, as above.
  **Refine** opens it in the editor.
- The heights come from public elevation data. The gallery lists its credits, and each map's
  description carries them.

| Path | What it is |
|---|---|
| [src/](src/) | The website. `src/core/` is the generator and format code: pure TypeScript that runs in the worker, in Node and in tests. |
| [public/real-places/](public/real-places/) | The Real places gallery's data and card pictures, written by `tools/real-places.ts` from the [landscape survey](investigation/landscapes/README.md). |
| [tools/](tools/) | Command-line tools on the same core: batch generation, the Python oracle, the benchmark and the in-game check files. |
| [PLAN.md](PLAN.md) | The implementation plan for the website: architecture, settings, generation pipeline, validation rules, scoring, tests, and (§19) the foundations shared with the editor. |
| [EDITOR_PLAN.md](EDITOR_PLAN.md) | The plan for the in-browser map editor and the Claude integration. |
| [docs/README.md](docs/README.md) | Which documents are current and which are history. |
| [ROADMAP.md](ROADMAP.md) | One milestone order for both plans. |
| [AUDIT.md](docs/archive/AUDIT.md) | The audit that reconciled both plans with the investigation. Kyler's answers to its decisions are in PLAN.md §20. |
| [docs/ingame-log.md](docs/archive/ingame-log.md) | The in-game checks each milestone needs. They are deferred for now and listed as pending. |
| [FORMAT.md](FORMAT.md) | The `.timber` map format as the game writes it in 1.1. |
| [investigation/](investigation/README.md) | Every study behind the plans, what became of it, and where its adopted pieces live. |
| [investigation/REPORT.md](investigation/REPORT.md) | What the game's code, data and maps say about map rules and design, with the numbers behind every threshold. |
| [investigation/calibration.json](investigation/calibration.json) | Measurements of the 19 official maps and 9 workshop maps. |
| [prototype/](prototype/) | The Python prototype: map reader/writer, generator, validator and round-trip test. It stays as the reference implementation and test oracle for the website. |

## Website quick start

Node 22 or later. The oracle and the calibration test also need Python 3.11+ with
`prototype/requirements.txt`.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run oracle
```

```bash
npm run gen -- --seeds 1-10 --sizes 96,128,256 --out out/batch
```

- `npm run dev` serves the site at <http://localhost:5173/dam-good-maps/>.
- `npm run try` builds the site and serves it at a local address, as the preview shows it.
  `npm run try -- --public` builds it as the live site.
- `npm test` runs the unit and contract tests. `npm run test:quick` skips the four heaviest, as CI
  does on every push; `npm run test:heavy` runs only those, as CI does nightly.
- `npm run oracle` generates 50 seeds × 3 sizes, checks each map with the Python validator and
  round-trip test, and compares the two validators check by check on 50 of them and on the
  official maps (when `investigation/raw/builtin` is present).
- `npm run gen` writes maps from the command line.
- `npm run batch` reports first-attempt and final pass rates (default 100 seeds at 128²).
- `npm run sheet` makes a contact sheet: seeds 1–30 of every theme at 128² on one page that opens in
  the browser. `--compare <git ref>` puts another version's maps beside them.
- `npm run test:e2e` builds the site and runs the browser tests: Chrome and Node produce the same
  bytes, the editor's tools and its generate-refine journey, the 3D view, the Real places
  gallery on a desktop and a phone, and every local investigation map through import, 3D and export.
- `npm run places` rebuilds the Real places data from the landscape survey's library, checking every
  map. `npm run places -- --check` says whether the committed data matches a fresh run.
- `npm run bench` times generation at 128²; `npm run bench:water` times the water settle at 256².
- `npm run bench:preview` times the editor's water preview after local edits at 256².
- `npm run bench:3d` measures the 3D view's build time and frame rate at 256² in Chrome. It opens
  browser windows, so it runs locally only. It writes `out/m4/bench3d.json`.
- `npm run bench:brush` measures painting with a brush at 256² in Chrome: the time from the pointer
  to the frame, the frame times and undo. It runs locally only and writes `out/live/bench-brush.json`.
- `npm run fixtures` rewrites the water golden vectors from the Python reference.
- `npm run build:spike` builds the Claude artifact test page into `dist-spike/`.
- `npm run spike:check` runs that page and the Messages API CORS page in Chrome. It writes
  `out/spike/checks.json`.

## Prototype quick start

Python 3.11+ with `numpy` and `Pillow`.

```bash
python prototype/generate_test.py --seed 4242 --out out
```

```bash
python prototype/validate.py out/*.timber
```

```bash
python prototype/roundtrip_test.py
```

The round trip reads maps copied from a local game install into `investigation/raw/` (not
committed; see [investigation/REPORT.md](investigation/REPORT.md) for how they were collected).

To play a generated map, copy the `.timber` file to `Documents\Timberborn\Maps` and pick it
under New game.

## License

Copyright (c) 2026 Timbermods. Free software under the [GNU Affero General Public License v3](LICENSE) (or any later
version): use, study, modify and share it freely. If you distribute a modified version, or run one as a website or
service, you must offer its full source to its users under the same licence.

The maps you make with Dam Good Maps are yours; the code's licence doesn't cover them. Versions published before
2026-10-01 stay under the MIT licence they were released with.

Timberborn is a game by Mechanistry; this project is not affiliated with Mechanistry.
