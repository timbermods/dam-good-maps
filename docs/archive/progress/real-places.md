# Real places

**Built** on branch `feature/real-places` (PLAN §20 D136, ROADMAP "Real places"). It is released as
`real-places-done`, right after `map-look-done`. No generated map changes: the generator stays
0.6.0.

- **The gallery** (`real-places/index.html`, `src/places/`), linked as **Real places** at the top of
  the generator. 85 maps made from real land. Each card shows our own top-down render of the map
  and its settled water, the name ("Near Yosemite Valley"), the landform, size and scale, and a
  line on how it plays. **Landform** and size filter the list; the page's query keeps them, so Back
  returns to the same list. On a phone the cards stack, the picture beside the text.
- **Download** fetches the place's data and builds its `.timber` in a worker (`place.worker.ts`),
  with a progress bar; the page never waits on it. **Refine** opens the generator page at
  `#place=<id>`: its worker builds the same file and opens it through the existing import path
  (`ed.openTimber`, `MapSession.importMap`). If a map is saved in the browser, the page asks first
  and offers its project file (a place must never replace a player's edits unasked).
- **The text:** near the top, "Each map is inspired by the land near its namesake, at Timberborn's
  scale. It is not a replica." (Kyler's instruction). At the bottom, **Elevation data**: the source
  (Terrain Tiles on AWS), what was changed, that the providers do not endorse the maps, and every
  required provider notice, verbatim (`investigation/landscapes/ATTRIBUTION.md`;
  `src/core/places/attribution.ts`).
- **In-game description** (`placeDescription`): landform, size, scale and how it plays; "Inspired by
  the land near <place>, at Timberborn's scale; not a replica."; the source, the changes and "The
  data providers do not endorse this map."; the provider notices. The game shows the file name,
  `Near <place>.timber`, as the map's name.
- **One build path** (`src/core/places/place.ts`): the place's objects as entities (ids hashed from
  the place), the canonical settle, soil moisture and contamination (build.ts step 10), the world
  and thumbnail as gen/pack.ts writes them, `validateMap` in the export profile, `writeTimber`. A
  pure function of the data: the same bytes in Node, in the gallery's worker and in the editor's.
- **The data** (`tools/real-places.ts`, `npm run places`): reads the survey's library at run time
  (product code never imports `investigation/`) and writes `public/real-places/`: `index.json`
  (38 KB, 8 KB gzipped), `data/<id>.json.gz` (453 KB in all, at most 22 KB each: heights as one
  digit a tile, sources, start, and each kind of object as tile gaps) and `cards/<id>.jpg` (240²
  JPEG, 652 KB in all, 7.7 KB each). It checks that the place's builders write exactly the
  survey's objects, builds and validates every map, and records each file's sha256 in the index.
  `--check` compares the committed files with a fresh run. The gallery keeps the library's order:
  rounds of one place per landform, so neighbours differ.
- **Page weight:** the page's own code is 26 KB of script (11 KB gzipped) and 9 KB of styles. It
  loads the index and the cards in view (lazily); the build worker (101 KB) and a map's data load
  on the first **Download**.
- **Left out:** the survey's three random-land controls (Random land 37, 41 and 49): controls, not
  places (Kyler's instruction). 85 of the library's 88.
- **Names:** the survey's, without "(… sample)" and the scale. One is renamed: "Near Death Valley
  Badwater fan" is "Near Death Valley", because badwater is a hazard in the game and the map has
  none.
- **How it plays:** one line per landform family, from the survey's play value
  (`investigation/landscapes/FAMILIES.md`) in plain words. It says what the landform tends to give;
  a window may show only part of the named landform.
- **Separate from the generator** (D108): only the gallery, the generator worker's `openPlace` and
  the page's Refine link use real places, and the page's own bundle loads only the fetch helpers. A
  contract test holds this.
- **M12 readiness** (D134): not applicable. Real places are content, not a way to edit or
  understand maps.

## Checks

Blocking, under Kyler's one rule (D115): every map passes the validators and exports, and the page
works on a desktop and a phone.

- **Every map** (`tests/contract/places-build-{1,2,3}.test.ts`, 85 cases): built as the page builds
  it, it passes the export profile, and its written file passes every check of the generate profile
  on its own settle; its sha256 and size are the index's. Advisories stay advisories (most maps
  have `plants.drought`; some `start.reach` or `water.reservoir`).
- **Both validators** (`tests/contract/places.test.ts`, a sample of 5: two at 96², two at 128², one
  at 256²): `prototype/validate.py` passes each and gives every check the same verdict. CI has
  Python; a machine without it skips this.
- **Refine** (the same sample): the editor imports each place with its name and size, passes the
  load checks, and exports it unedited as the same file.
- **Credits:** every place's description carries the "not a replica" line, the source and every
  provider notice.
- **The page** (`tests/e2e/places.spec.ts`): the gallery lists 85 cards with the credits; the
  landform and size filters work and survive a reload; **Download** saves `Near <place>.timber`,
  byte for byte Node's and the index's; Chromium and Node build the same file at 96², 128² and 256²;
  **Refine** opens the editor on the place, and its export is the same file; the generator links to
  the gallery, and a saved map is never replaced unasked; on a phone (375×812, touch) nothing is
  wider than the screen, the cards stack, the filters work and a download is Node's file; an
  unknown place says so and shows the generator.

Information:
- Build time, Node on this machine: 96² 0.3–2 s, 128² 0.8–4.5 s, 256² 6–14 s, nearly all of it the
  canonical settle. The browser is about the same. A phone will be slower; the page stays
  responsive.
- CI's unit and contract step takes about 5.5 minutes, up from about 2: the 85 builds run in three
  files side by side (about 2 minutes each on CI), and the Python sample takes most of
  `places.test.ts`'s 2 minutes. Moving the three build files to the nightly run would win the
  time back, at the cost of finding a changed place a day later.
- The in-game check is optional: when the probe is available, Kyler may approve a batch that loads
  a few of them (D117). None was run, and Timberborn was never launched.
- `playwright.config.ts` takes `DGM_E2E_PORT` (default 4173), so the browser tests can run beside
  another checkout's.

Deployed: real-places-done, 2026-09-25, live check passed (PR #31; the generator's download unchanged, sha256 `5118b6a6…`; the live gallery page and its index answer 200).
