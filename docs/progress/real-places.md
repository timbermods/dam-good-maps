# Real places

> **Where a fresh session resumes (2026-09-26, round 2 after D245; branch `feature/real-places-2`,
> PR #35 into `dev`).** The D245 rebuild is finished, committed and pushed (last commit on the
> branch; CI green on #35); nothing is running and nothing is uncommitted.
>
> - **Done:** D214 (the flow cap per size, default #80), the "Centre" titles (#81), the
>   starting-logs floor with groves that read the land (D224, D227, D229, #82), and D245: every
>   place kept on its own land; only the absolutes block (the checks that are not about
>   playability, and the floor); notes for the three things that sink a player; 151 places, none
>   dropped (Majuli back). The D245 audit (the 34 D214 changed, and every first map built from an
>   off-centre sample, with the version chosen and why) is in "Kept on their own land" below and in
>   #35's comment https://github.com/timbermods/dam-good-maps/pull/35#issuecomment-5852892041
>   (default #84): 35 first maps at their centre, 10 swapping names with a second map that already
>   was their centre, 23 kept on their sample; the rest back to their own land and mapping. Notes
>   and what blocks: default #85. The review sheet (6 pages, `docs/sheets/real-places-review/`) is
>   posted: https://github.com/timbermods/dam-good-maps/pull/35#issuecomment-5852893380 (the
>   earlier sheet is marked out of date). The probe group for water that keeps moving is ready
>   (`npx tsx tools/places-probe.ts`; nothing launched). The tall list (D172) is below.
> - **Left:** (1) Kyler's drops, from the new review sheet: take each numbered place out of
>   `tools/places/selection.json` (a first-round place goes to `dropped` with his reason), then the
>   commands below. (2) Badwater on every map (D200, D213), once M9a is on `dev`: in `buildPlace`
>   (src/core/places/place.ts) pass `badwater: { setting: "normal", within:
>   DIFFICULTY_RULES.normal.badwaterWithin }` to `planMapResources` and write its resettled water
>   (`resources.water`) into the file before the floor's groves are counted; take #54's changes to
>   places.test.ts and placesCommon.ts; raise `VERSION` in tools/places-convert.ts to 5; then the
>   commands below. (3) Kyler's answers to #80–#82, #84, #85 and #82's dead floor trees.
> - **Commands** (from the worktree, at most 4 threads while M9a runs; the survey's patches must be
>   in `investigation/landscapes/.cache/`: `npm ci --ignore-scripts --cache ./npm-cache` and `npm
>   run sample` there, then `git checkout` the two data files it rewrites):
>   `npx tsx tools/places-convert.ts --threads 4`; `npx tsx tools/real-places.ts --threads 4`;
>   `npx tsx tools/places-thumbs.ts --all --port 4832 --threads 4` (the GPU, about 30 minutes);
>   `npx tsx tools/real-places.ts --check --threads 4`; `python tools/places-sheet.py
>   docs/sheets/real-places.png "Real places, second round" --html
>   investigation/landscapes/local/places-sheet`; `python tools/places-review.py
>   docs/sheets/real-places-review --changed-since <the commit Kyler reviewed> --per-page 26`; then
>   `npm run typecheck`, `npx vitest run --project quick --maxWorkers=3`, `npx vitest run --project
>   heavy places-build --maxWorkers=3`, `DGM_E2E_PORT=4833 npx playwright test
>   tests/e2e/places.spec.ts tests/e2e/save-to-timberborn.spec.ts --workers=1`.

**Built** on branch `feature/real-places` (PLAN §20 D136, ROADMAP "Real places"). It is released as
`real-places-done`, right after `map-look-done`. No generated map changes: the generator stays
0.6.0.

Round 2 (below) changes the titles, the description, **Download**, **Refine**, the card pictures
and where the byte check runs.

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

## Round 2 (Kyler, 2026-09-25)

Built on branch `feature/real-places-2`. Kyler's four instructions, and the card pictures he added.
Several round-1 details above are replaced here: the titles, the description, **Download**,
**Refine**, the pictures and where the byte check runs.

- **Credits by link.** Every provider's licence or terms were read, and each verdict is in
  [docs/real-places-credits.md](../real-places-credits.md). Nine of the eleven accept credit by a
  link. Two need their notice in the file itself, and only for maps in their region: Kartverket
  (its name wherever its data is used: Geirangerfjord and Lofoten) and LINZ (CC BY 3.0 NZ asks
  for the licence on every copy: Waimakariri River, Milford Sound, Hooker Valley, Mount Taranaki).
  Kyler confirmed both judgement calls: Austria's data under CC BY 4.0, and New Zealand's notice
  kept in the file.
  The new **credits page** (`real-places/credits/`) and the gallery show the same credits in full
  (`src/places/Credits.tsx`): the source, the changes, that the providers do not endorse the maps,
  and every notice with a link to its licence.
- **The in-game description** is the title; "Inspired by the land near <place>, at Timberborn's
  scale; not a replica."; "Credits: https://timbermods.github.io/dam-good-maps/real-places/credits/";
  then, for the six maps above, "Elevation data: <notice>." Plain ASCII: whether the game shows
  other characters waits for a probe batch, asked for first. So Kartverket's line has "(c)" where
  its terms ask for "©" until then.
- **Built at deploy time.** `npm run places:build` (`tools/places-build.ts`) builds every place's
  `.timber` with `src/core/places/place.ts`, in worker threads, into
  `dist/real-places/maps/<id>.timber`. It runs in `deploy.yml` after `vite build`, before the
  noindex step. A map that fails the export profile or any check of the generate profile, or whose
  file is not the index's (sha256 and size), fails the deploy. Every deploy rebuilds with the engine
  it deploys, so the files always match it; the index keeps each sha256, so a change shows in its
  diff. 85 maps in 30 s on this machine's 16 threads; 15.7 MB in all, the largest 437 KB.
- **Download** is a plain link to the static file (`download` names it after the title): instant.
  **Refine** fetches the same file and opens it through `MapSession.importMap`. The browser never
  builds a place: `place.worker.ts` and the generator worker's `openPlace` are gone.
  `npm run dev` builds a map on request with the same code (a dev-server middleware in
  `vite.config.ts`); `npm run preview` serves what `npm run build` and `npm run places:build` wrote.
- **The byte check** (`places-build-{1,2,3}.test.ts`, all 85 maps against the index) moved to the
  nightly run (vitest's heavy project). It also runs in the release check: a CI job,
  `release-places`, on pull requests whose base is `main` (`npm run test:places`). Every push keeps
  a sample of every size (`placeSample`: the first two at 96² and 128², the first at 256²) with the
  same assertions, in `places.test.ts`; the browser tests serve the same sample's files. CI's unit
  and contract step is back to about 3.5 minutes (from about 5.5); `npm run test:places` takes
  about 90 s here.
- **Titles.** No "Near", no "(… sample)", and the awkward ones tidied; the index keeps the survey's
  name verbatim (`surveyName`) and the part it sampled (`sample`). The ids, the data and picture
  files and the `.timber` names follow the new titles. The description's sentence adds "the" where
  a title needs it ("near the Grand Canyon"). The gallery's "inspired by, not a replica" line
  stays. Per-map "how it plays" lines wait for M9c's names and descriptions.
- **Card pictures.** Two for each place, both drawn by the Map look 3D view in its clean look, on
  this machine's GPU in the installed Chrome (`npm run places:thumbs`, `tools/places-thumbs.ts`),
  as WebP, and both facing the same way, so they read as one map:
  - the **overview**, 480 px (twice the card): the camera looks along the map's axis nearest to
    the way the land rises, from the low side (the index's `view`: N, E, S or W;
    `src/core/places/view.ts`), and stands so the land fills the picture: the far edge spans it
    under a thin band of sky, and the near edge runs off the bottom. Drawn at 960 px and scaled
    down.
  - the **map from above** (the view's Top mode, an orthographic camera): moist grass, cracked
    earth, water by depth and contaminated ground, as in the 3D view. It is turned by whole
    quarter turns so its top is the overview's far edge. A whole number of pixels a tile (480 px
    at 96², 512 px at 128² and 256²), so every tile edge is sharp.

  The card shows the overview with the map from above as a minimap in its corner, which fills the
  picture on hover, keyboard focus or a tap (Kyler chose it over a side-by-side layout, which is
  gone). Each picture has a small **north arrow**, drawn by the page, not the picture: an upright
  "N" in a round badge, with a pointer toward north, and a label ("North is to the right").
  The minimap, its swap and the arrow are shared components with shared styles
  (`src/ui/Pictures.tsx`, `src/ui/NorthArrow.tsx`, `app.css`), as is the link that looks like a
  button, so the design pass restyles them rather than rebuilds them (D176).

  About 84 KB a place, 7.1 MB for all 85; the gallery loads them lazily, as their cards come into
  view. The index records which `.timber` they show (`imageFrom`); a test fails when a map changed
  and its pictures did not. About 4.3 s a place, 6 minutes for all 85. The committed maps from
  above were turned to their view in place (every pixel kept); all the pictures are drawn again
  after the rebuild without walls.
- **The survey's elevation patches, downloaded again** (Kyler's yes, 2026-09-25), for the rebuild:
  the survey's own `sample.ts`, unchanged, into its ignored cache
  (`investigation/landscapes/.cache/`), with at most 6 requests at once, 50 ms apart. All 4,050
  patches (681 MB) from 6,102 Terrain Tiles (396 MB) in 5.5 minutes, no failures. Every tile
  matches the sha256 the survey recorded, and the rebuilt patch manifest is byte for byte the
  committed one. Nothing of it is committed.
- **The live check** also downloads the smallest real place from the live gallery and compares it
  with the deployed index's sha256 (and the checked-out commit's), and loads the credits page.

Title changes (old → new). Every other title only loses "Near": Badlands National Park, Toklat
River, Crater Lake, Colca Canyon, Twelve Apostles, Mount Mayon, Rhine and Moselle, Drakensberg
Amphitheatre, Kaieteur Falls, Death Valley, Geirangerfjord, Torres del Paine, Tiger Leaping Gorge,
Phong Nha, Uvac River, Mount Roraima, Ethiopian Highlands, Lofoten, Drumheller, Tagliamento River,
Blyde River Canyon, Cliffs of Moher, Paricutin, Alaknanda and Bhagirathi, Niagara Falls, Glencoe,
Verdon Gorge, Chocolate Hills, Kinabatangan River, Deccan Plateau, Bardenas Reales, Waimakariri
River, Lake Toba, Mount Etna, Gullfoss, Milford Sound, Lauterbrunnen, Katherine Gorge, Bungle
Bungle, Tibetan Plateau, Painted Desert, Ngorongoro, Fish River Canyon, Mount Fuji, Victoria Falls,
Todgha Gorge, Monument Valley, Colorado Plateau, Sete Cidades, Copper Canyon, Mount Taranaki,
Bandiagara, Iguazu Falls, Yosemite Valley, Tara Gorge, Mamore River, Capitol Reef, Altiplano.

| Old | New |
|---|---|
| Near Thousand Islands Saint Lawrence | Thousand Islands |
| Near Lena delta | Lena Delta |
| Near English Lake District | Lake District |
| Near Aso caldera | Aso Caldera |
| Near Danube delta | Danube Delta |
| Near Western Ghats Mahabaleshwar | Mahabaleshwar, Western Ghats |
| Near Roaring River fan | Roaring River Fan |
| Near Chilean Aysen fjord | Aysen Fjord |
| Near Finnish Saimaa | Lake Saimaa |
| Near Ennedi plateau | Ennedi Plateau |
| Near Grand Canyon Colorado | Grand Canyon |
| Near Na Pali coast | Na Pali Coast |
| Near Godavari delta | Godavari Delta |
| Near Niagara escarpment Hamilton | Niagara Escarpment |
| Near Taklimakan Kunlun fan | Kunlun Alluvial Fan |
| Near Dinaric karst Plitvice | Plitvice Lakes |
| Near Lower Mississippi oxbows | Mississippi Oxbows |
| Near Skeidara outwash | Skeidara Outwash |
| Near Blue Mountains Jamison | Blue Mountains |
| Near Atacama fan | Atacama Fan |
| Near Kenai Aialik Bay | Aialik Bay |
| Near Aoraki Hooker Valley | Hooker Valley |
| Near Li River Yangshuo | Li River |
| Near Goosenecks San Juan | Goosenecks of the San Juan |
| Near Brahmaputra near Majuli | Majuli, Brahmaputra |
| Near Ilulissat icefjord | Ilulissat Icefjord |
| Near Tsingy Bemaraha | Tsingy de Bemaraha |

Tests updated to Kyler's decisions (D148), none weakened:
- `places.test.ts`: the title check (was "starts with Near") checks the new rules, the survey's
  name and sample in the index, and the renames; the description check (was: the full credits in
  the file) checks the new format, plain ASCII, and exactly which maps carry which notice; the card
  check (was a 240 px JPEG) checks a 480 px WebP that shows the current map; the D108 check (was:
  the gallery, the editor's worker and the Refine link use real places) drops the worker, which no
  longer builds them, and adds that the pages only import the builder's types. New: every
  provider's licence and verdict; a sample of every size, built, validated and compared with the
  index on every push.
- `places-build-*.test.ts`: unchanged assertions, now nightly and in the release check.
- `places.spec.ts`: **Download** is a link to the static file (was a button that built it); "Node
  and Chromium build the same file" becomes "the site serves each place's `.timber` as Node builds
  it", since the browser no longer builds one; the credits test checks every notice and licence
  link. New: the credits page on a desktop and a phone, and that the pictures load lazily; the
  minimap (hover, keyboard focus, a click, a tap on a phone) and its north arrows on one card. The
  side-by-side tests went with the side-by-side layout (Kyler chose the minimap), and the map from
  above's text alternative no longer says "north up": the arrow says where north is.
- `tests/unit/places-view.test.ts`: new. The index's `view` is the one the overview's camera works
  out from each map; each view's camera looks that way; north is its quarter turns clockwise from
  the top; and the arrow's labels.
- `tests/live/live.spec.ts`: new, the real place and the credits page (above).

Checks: `npm run typecheck`, `npm run test:quick`, `npm run test:e2e` and `npm run test:places`
pass locally. The deploy build (`npm run build`, `npm run places:build` and the noindex step) was
run locally, and the live check passes against it, served locally. Timberborn was never launched.

## The rebuild: no walls, today's rules, 150 places (Kyler, 2026-09-26)

Every place converted again from the landscape survey's elevation patches, after the start and edge
rules (#44) and the resources (#43, generator 0.6.2) reached `dev`: no perimeter walls or rims
(D151, D152), sources only where water begins (D171), the start requirements as they are now
(D153, D164), and resources and mine sites from the shared baseline (D167–D170). The gallery grows
to 150 (D174). No tall versions this round (D172).

- **The conversion** (`npm run places:convert`, `tools/places-convert.ts` and `tools/places/`),
  per survey row (a patch and a mapping to 16 levels):
  1. The terrain: the survey's patch, cropped and quantised as the survey did, and nothing more.
     No wall, no rim; water drains off the map wherever the land takes it.
  2. The sources, where water begins: a row across each river's mouth where it comes into the map
     (read from the survey's routing of the halo round the map), about 0.5 of strength a tile as the
     generator's mouth rows have, and a spring at each channel head inside; at most 8 groups. The
     flow is the survey's, twice the official maps' strength for the size, shared by the square
     root of the area each drains. The water settles; any source another's water reaches
     (`water.source_in_flow`) or whose water never leaves the map (`water.outflow`) goes, and its
     flow goes to the rest; again until none does. 51 places lost a group this way (78 inside a
     flow, 3 pooling).
  3. The start: flat dry 3×3s with a dry ring and their door on their level, the best in each 8×8
     block by moist land near, scored by the walk to water a pump reaches and the moist land within
     20 tiles' walk; the best six are built in full and checked with every check of the generate
     profile, and the first that passes is the start.
  4. Real land's valley floors are wide and flat at 16 levels, so twice the official flow often
     spreads thinner than a pump needs (0.3 deep). When no start passes, the conversion runs again
     with 4 and then 8 times the official strength (more flow from the sources' strength, as D171
     allows, never from sources downstream). 76 places use 2×, 49 use 4× and 25 use 8×.
     (Superseded by D214, below: no place above its size's cap.)
  5. A map whose water stands on more than 60% of it, however thin, fails: flat fans and braided
     plains at 16 levels can carry a film of water over most of the map, which passes the flood
     check (it counts water over 0.05 deep) but reads as flooded. Three such maps of the first
     choice were replaced.
- **The resources are the late stage**: a place's data holds only its terrain, sources and start
  (format 2); `buildPlace` plans its trees, bushes, ruins and mine sites with `planMapResources`
  on the settled ground each time the map is built, seeded by the survey row. A change to the
  baseline needs no new conversion: `npm run places` rebuilds every map (41 s on 8 threads, 77 s
  on 4).
- **The choice**, as the first round's (`investigation/landscapes/curate.ts`), in
  `tools/places/selection.json`:
  - The first round's 85: 70 kept from their own row; 14 from another row of their region, their
    title kept (Alaknanda and Bhagirathi, Danube Delta, Mahabaleshwar, Glencoe, Ennedi Plateau,
    Deccan Plateau, Mount Etna, Godavari Delta (now 256²), Gullfoss, Aialik Bay, Li River, Tsingy de
    Bemaraha, Mamore River, Altiplano); 1 dropped: **Majuli, Brahmaputra**. On all 16 of its region's
    rows tried, no start passes: the braided floodplain is flat and wet, and at the flow its water
    needs there is no flat dry ground for a mine site (`resources.mine_site`), or the water does
    not settle.
  - 66 added, in rounds across the families (fewest places first), preferring a region no place
    came from yet, then a size (128², 256², 96², 128² by round), then the survey's score. A region
    gives at most two maps, and its second must be other land (at most a quarter of the smaller map
    inside the other's footprint). 13 come from regions the first round left out: Raja Ampat,
    Kawarau and Shotover, Temagami, Etretat Cliffs, Mississippi Delta, Kosi Fan, Kornati, Green and
    Colorado, Masurian Lakes, Cape of Good Hope, Stockholm Archipelago, Nahuel Huapi, Rio Negro and
    Solimoes. The other 53 are a place's second map, titled by the part they show ("Colca Canyon
    Centre", "Toklat River North"); the index keeps the survey's name.
  - By family: 6 to 9 each (archipelago, confluence, delta and lakes 6; braided, coast and fan 7;
    caldera 9; the rest 8). By size: 47 at 96², 66 at 128², 37 at 256².
- **Every place passes** the export profile and every check of the generate profile: no edge
  walls, no source inside a flow, a mine site, the start's water, food and wood. Advisories, as
  information: plants.drought 137, water.reservoir 88, start.reach 76, water.clean_exists 9,
  water.clean_reach 3, resources.trees 3, resources.scrap 1. The places tests' known-fault flags
  are empty (`PLACES_HAVE_EDGE_WALLS` false, `PLACES_SOURCES_IN_FLOW` empty,
  `PLACES_LACK_MINE_SITES` false).
- **Badwater on every map (D200)**: not yet. The badwater step is being built beside this one; when
  it lands, the places take it in `buildPlace` (after the clean settle, before the resources), and
  `npm run places:convert` (with its `VERSION` raised, it converts the selection's rows again, about
  5 minutes), `npm run places` and `npm run places:thumbs` bring the gallery up to it.
- **What stays out of git** (D195): the survey's patches (`investigation/landscapes/.cache/`, 1.1
  GB; `npm ci --ignore-scripts --cache ./npm-cache` and `npm run sample` there download them again
  and check every tile's sha256) and every conversion (`investigation/landscapes/local/real-places-2/`,
  528 files). Committed: the places' data (150 files, 559 KB), the index, the card pictures and the
  selection.
- **Time**: the first choice ran 472 conversions in 31 minutes on 8 threads; a later one, with the
  kept conversions, about 2.5 minutes. The deploy's `npm run places:build`: 150 maps, 27.7 MB, 45 s
  on this machine.
- **Pictures**: every card drawn again on the GPU (`npm run places:thumbs -- --all`), the overview
  and the map from above turned to match. The contact sheet of the whole gallery:
  `docs/sheets/real-places.png`; locally `C:\dgm-workshop\places\sheet.html` (both pictures of
  every place) and `C:\dgm-workshop\places\walls.html` (ten places with their wall and without).
  Kyler says which should go.

Tests updated to the rebuild (D148), none weakened:
- `placesCommon.ts`: the known-fault flags are empty; the byte check now asks every place to pass
  every check.
- `tests/unit/places-view.test.ts`, `places.spec.ts`: unchanged; they read the new index.
- `places.test.ts`: the gallery holds the selection's places (at least 130; was 85); new: the choice
  (the gallery's order is the selection's, the first round's 85 kept, replaced or dropped with a
  reason, families within 3 of each other, only named survey rows); the land without edge walls
  (every edge under the check's 60%) and data that holds only sources and a start; the sample's
  resources from the baseline (a mine site, bushes, trees). The pinned list of maps carrying a
  file notice follows the new places; the rename checks of a place no longer in the gallery
  (Majuli) read the titles module.
- `save-to-timberborn.spec.ts` (from `dev`): Save to Timberborn on a card fetches the static file,
  so it uses a card the browser tests' server builds, and checks its bytes.
- `reshape.test.ts` (a heavy test from `dev`, which this branch's nightly run caught): "an object a
  lake would drown is cleared" drew its lake round River Valley seed 13's small relic; since the
  resources of generator 0.6.2 that relic has no room for one, so the case uses seed 14, where the
  same check holds.

## Rivers, not floods (Kyler, 2026-09-26, D214)

Kyler's review of the rebuilt gallery: no water sources at 8× the official strength (25 maps had
them: floods, not rivers); strengths stay near the official range; the start moves closer to water
instead, as Pick a place's designed water places it; a place that still can't work is dropped; and
the "Centre" titles get a real feature or a direction. The rebuild's 4× and 8× steps (step 4 above)
are gone. Built after merging `dev` (Live editing, waterfalls, the forces' investigations) at
04e90ef; the merged tree still built all 150 maps as the index had them.

- **The cap for each size** (`FLOW_CAP`, tools/places/convert.ts; a default the session chose,
  docs/decisions-pending.md #80). The official maps' strongest water for the size, measured from
  investigation/calibration.json as the resources step measured its baselines (by size class,
  Nomads and Oasis left out, joined in ln(area)): 6.7, 3.4 and 4.1 a second per 10,000 tiles at
  96², 128² and 256² (Thousand Islands is the strongest large map, 27 in all). As multiples of the
  generator's own strength for the size (3.3, 2.2 and 1.1 per 10,000 tiles, the "1×"), that is 2.05,
  1.5 and 3.75. The cap is that, never under the survey's own 2× (at 128² 2× gives 4.4 per 10,000,
  near the official 3.4, and 66 places already had it): **96² 2× (6.1 in all), 128² 2× (7.2), 256²
  3.75× (27)**. Before, 8× gave up to 58 on a 256² map and 29 on a 128² one, twice to five times
  anything official. A uniform 4× was measured too: it keeps 128² maps at 2.6 times the official top
  and leaves them wetter (water on a median 37% of the map at 4×, 23% at 2×).
- **When the water does not settle or no start passes at that flow.** Measured first on all 150
  (`.scratch`, not kept): at 2× the places that had needed more flow failed mostly because the water
  did not settle within 4 days (46 of 68), not for the start (22): at 16 levels real land's wide
  floors carry thin sheets that keep moving. So, at each flow up to the cap:
  1. the survey's sources, as before, and the start as before;
  2. no start passes: **the start moves to the water** (`walkToPumpShore`: every tile's walk to the
     nearest shore a pump works from, walked back from all of them at once; the starts with one
     within their walk come first, as Pick a place screens starts from the shore; up to 10 more
     tried in full);
  3. still nothing, or the water does not settle: **fewer, larger rivers** at the same flow, the 3
     largest source groups and then the largest (Pick a place's designed water uses one head on
     small maps and three on large ones). Sources still only where water begins (D171).
  A place whose row still fails tries its region's other rows as the choice's rules allow (a
  first-round place its first-round fallbacks, title kept; an addition the region's other rows,
  best first; always other land than the region's other map, checked against the maps as they end
  up), and is dropped, with the reason, when none passes.
  (Superseded by D245, below: step 3 and the other rows are gone; a place keeps its own land and
  water, and anything short ships as it is, with its note.)
- **What changed** (with the starting-logs floor below, in one conversion: `VERSION` 3, 234
  conversions, 8 minutes on 4 threads):
  - Of the 76 places at 2×, 70 keep their data as it was; 6 moved their start for the floor.
  - Of the 74 at 4× or 8×, 40 keep their row, at 2× (39) or 3.75× (Kunlun Alluvial Fan, 256²). In
    all, 54 places have fewer rivers (3 or 1 source groups) and 11 starts moved to the water; the
    other place at 3.75× is Victoria Falls Southwest, now 256².
  - 34 are made from another row of their region, because their own fails at the cap (16 no start
    has pumpable water, 15 the water does not settle, 3 too little wood). 13 are the same land with
    another height mapping (Badlands National Park, Crater Lake, Twelve Apostles, Lena Delta, Mount
    Roraima, Drumheller, Aso Caldera, Niagara Falls, Aysen Fjord, Kinabatangan River, Ennedi Plateau,
    Skeidara Outwash, Victoria Falls); 21 show other land of their region: Death Valley,
    Geirangerfjord, Lofoten, Danube Delta, Glencoe, Lake Saimaa, Na Pali Coast, Iguazu Falls,
    Yosemite Valley, Tsingy de Bemaraha, Temagami, Mississippi Delta, Phong Nha Southwest and Victoria
    Falls Southwest (now 256²), Danube Delta Southwest, Fish River Canyon North, and five second maps
    that now show another part (below). First-round titles are kept.
  - **None dropped** by D214 or the floor: every place that failed found a row that passes. The one
    drop is still the first rebuild's Majuli, Brahmaputra.
  - Flow: 148 places at 2×, 2 at 3.75×. Water covers a median 18% of a map (at most 45%).
  - Advisories, as information: plants.drought 136, water.reservoir 101, start.reach 74,
    water.clean_exists 26 (was 9: less water, so less of it stays clean through a badtide),
    water.clean_reach 4. Every place passes the export profile, every check of the generate
    profile, and the floor.
- **Titles** (D214): a region's second map is named by its own part of the place: a real feature
  only where OpenStreetMap's named features in the map's square (queried for each square) and its
  heights make it sure, else a plain position or direction (tools/places/titles.ts `SECOND`; a
  second map at a place's centre without one stops the tool). Pending check #81.
  - Colca Canyon Centre → **Colca Canyon South Rim** (the rim plateau, Cabanaconde, south of the
    canyon floor along the north edge);
  - Tagliamento River Centre → **San Daniele, Tagliamento River** (the river's wide bed, and San
    Daniele del Friuli on its hills);
  - Li River Centre → **Xingping, Li River** (Xingping and Nine Horse Fresco Hill);
  - Drumheller Centre → **Red Deer River, Drumheller** (the town in the river's valley);
  - Lake Toba Centre → **Samosir, Lake Toba** (all four corners on the island);
  - Torres del Paine Centre → **Cuernos del Paine** (the four Cuernos peaks);
  - Uvac River Centre → **Uvac Meanders** (the meanders under the Molitva viewpoint);
  - Tara Gorge Centre → **Tara Gorge South** (south of the other Tara Gorge map);
  - Bungle Bungle Centre → **Bungle Bungle Northeast** (north-east of the other one);
  - Mahabaleshwar East, Western Ghats → **Kate's Point, Western Ghats** (the plateau's eastern edge);
  - Glencoe Centre → **River Coe, Glencoe**: now the same centre at 60 m a tile (the 30 m one fails
    at the cap), the whole glen, the Three Sisters and Bidean nam Bian;
  - Blyde River Canyon Centre → **Blyde River Canyon Southwest**, Ilulissat Icefjord Centre →
    **Ilulissat Icefjord East**: their centre fails at the cap, so they are the region's southwest
    and east samples, named by the part sampled;
  - also by the part sampled, second maps whose row changed: Plitvice Lakes Southwest → **Plitvice
    Lakes East**, Ngorongoro North → **Ngorongoro East**.
- **Pictures**: every card drawn again on the GPU (`npm run places:thumbs -- --all --port 4832
  --threads 4`). The tool follows `dev`'s editor: the view's canvas now sits in its own box beside a
  minimap, so the tool shows only the main canvas; and the editor shows its preview's water first,
  so the tool waits for the background check's exact settle (the checks dot stops waiting) before
  drawing. The water in every picture is the map's settled water as `dev`'s renderer draws it now
  (D212, D215: thin films read differently), so unchanged maps' pictures changed too.
- **Kyler's own list of places to drop** waits for him. He chose it from the sheet before D214; 34
  places now show other land, 46 other water or start, and 69 more trees, so it wants the new
  review sheet (below).
- **Badwater (D200, D213)**: still waits for M9a on `dev`, which carries #54. #54 gives
  `planMapResources` a `badwater: { setting, within }` input and returns the water settled again
  with the badwater springs. What is left: in `buildPlace` (src/core/places/place.ts), pass
  `badwater: { setting: "normal", within: DIFFICULTY_RULES.normal.badwaterWithin }` and write
  `resources.water` (the settle, moisture and soil) into the file when it is there, before the floor's
  groves are counted; take #54's changes to places.test.ts and placesCommon.ts; raise `VERSION` to 4
  (the start's checks then include start.badwater and resources.badwater_source), then `npm run
  places:convert`, `npm run places`, `npm run places:thumbs -- --all`, `npm run places -- --check`,
  the sheet and the review sheet. `PlaceData.badwater` stays for springs a place's data fixes itself
  (none now).

## The starting-logs floor (Kyler, 2026-09-26, D224, D227, D229)

Every place has at least the floor's logs within its walk, at every difficulty: 178 logs within 40
tiles' walk for game 1.1.2.4 (`src/core/data/log-floor.json`, D227 after D224's 167 within 20,
merged from `dev` at 9e5e73a and 7360e32). A blocking rule for the places until M9a's validators carry
it.

- **The count** (`startLogs`, src/core/places/place.ts): every grown tree (dead ones too; a
  sapling's logs never) by its species' yield from the floor's data, within 40 tiles' walk of the
  district center over the map's ground and its natural slopes, round what blocks walking (the start
  requirements' walk). Places have no slopes, so the walk stays on the start's own level.
- **Where a place is short** (D229: meet it in varied, natural ways, reading the place's real land;
  `plantForFloor`, src/core/places/wood.ts): the resources are planned as before, then the land
  within the walk is read as stands, each with its own trees: the river bank (moist ground within 4
  tiles of the water, on the start's side: birches, some pines), across the water (ground near the
  water whose straight line to the start crosses it: a pine forest, some oaks), a plateau (flat
  ground where the start stands high on the map: oaks), a side valley (ground most of whose
  surroundings stand higher, away from the river: pines), and plain woodland (the map's mix). The
  stands the land offers are drawn in a seeded order (one not used yet weighs more), and each gives
  a grove grown as the baseline grows its groves, seeded mostly 10–38 tiles out, apart from the other
  groves and the trees already there, until the logs lacking and a tenth more are there; when the
  stands run out, the last groves grow on at the edge of the trees already there. Grown trees, alive
  on moist soil and dead on dry, as the baseline's. The conversion then chooses only starts that meet
  the floor.
- **What it did**: 92 of the D214 gallery's places were under the floor within 20 tiles and 71
  within 40. In the final gallery **69 places got groves for the floor** (2,011 trees, 4,597 logs;
  2 to 4 groves a place mostly, 1 to 8 in all): 69 river-bank groves, 52 across the water, 23 in side
  valleys, 8 on plateaus and 67 in woodland; 111 of pines, 69 of birches, 39 of oaks. Every place
  meets the floor (the lowest has 178). **None dropped** for it; 6 places at 2× moved their start
  to meet it.
- **Minimum starting wood** (within 20 tiles, D227) stays the validators' `start.wood` at the
  difficulty the places are built for (Normal), as before; M9a's new defaults reach the places when
  they land.
- Default #82 (the stands, their trees, the tenth's margin).

## The review sheet (Kyler, 2026-09-26)

`python tools/places-review.py docs/sheets/real-places-review --changed-since 04e90ef` draws every
place in the gallery, numbered in its order, with its title and both card pictures, as JPEG pages
Kyler can read on a phone (30 places a page, each under 800 KB); cards changed since the sheet Kyler
saw are marked (new land, new water, the title it had). The places no longer in the gallery follow,
with the reason each went. Posted on PR #35 as "Review sheet: which places should go?"; Kyler replies
with the numbers to drop. Run it again after his drops.

Tests updated to D214 and the floor (D148), none weakened:
- `places.test.ts`: the first round's 85 are the first-round places plus the first-round drops (an
  addition D214 or the floor dropped would be listed with its status and its rule); new: each place's
  flow and its sources' total strength within the cap for its size; titles: every place's sentence
  is its survey place, a region's first map is titled by its place and its second by its own part
  (the titles module), never "Centre"; the title examples follow D214 (a centre map named by its
  land, one without a name stops the tool).
- `placesCommon.ts` (every place, nightly and in the release check; the sample on every push): the
  written file's logs within the floor's walk of its start are at least the floor.
- New `tests/unit/places-wood.test.ts`: the floor's groves on a made-up river map (the logs asked
  for; stands read apart; free dry reachable ground; grown; the same every time; clear of the trees
  already there).
- `carve.test.ts` (from `dev`): its real place is read by its new file name (grand-canyon).

## Kept on their own land (Kyler, 2026-09-26, D245)

Kyler's review of the round: the beauty of a real place is its composition of terrain features, so
failing a playability check never drops a place, swaps its land or changes its mapping or scale.
Only the absolutes gate a place; everything else is information, and what would sink a player gets
a note. Built after merging `dev` at 248ac1b (D244, D245).

- **What blocks** (`placeProblems`, src/core/places/place.ts): every check that is not about
  playability (the load checks, the design checks such as D171's sources in flow, the principles
  such as D151's edge walls) and the starting-logs floor (D224, D227). The 22 playability checks are
  information. The conversion (`VERSION` 4), `npm run places`, the deploy's `npm run places:build`
  and the places tests all follow it.
- **The conversion**: the survey's sources at the capped flow (D214's cap and D171 stay), the start
  at the best spot the land offers (the shore-first ranking, D214, when the first ranking finds none
  that passes everything). D214's fewer-rivers step is gone: a place keeps its own water. Water that
  does not settle within 4 days is kept as it is (D245 (6)), with its note. The attempt with the
  fewest notes, then the fewest shortfalls, then the least water wins. It fails only on the
  absolutes, and then the tool stops: nothing is swapped or dropped.
- **Notes** (`PLACE_NOTES`): "No water a pump can reach from the start" (start.water), "Too little
  wood near the start" (start.wood, Minimum starting wood within 20 tiles at Normal), "The water
  keeps moving" (water.settles). The everyday advisories get none. The index records them
  (`notes`); the gallery card lists them, each by an amber dot like the editor's checks dot; in the
  editor the checks dot already lists these checks when a place opens from Refine. 68 places carry
  notes: the water keeps moving on 44, no pumpable water on 28, too little wood on 1 (Twelve
  Apostles East); 5 carry two. 3 more fall short only of a mine site (Alaknanda and Bhagirathi,
  Godavari Delta, Majuli), which gets no note.
- **Versions** (D245 (7), (8)): every first map built from an off-centre sample, and the 34 places
  D214 changed, looked at again. The records (the survey's rows, round 1's frozen selection
  `investigation/landscapes/data/library-selection.json` and its score in `curate.ts`, round 2's
  selection) show that no sample was ever chosen for holding the place's signature: round 1 took
  each region's best-scoring passing row, often by one fewer failed check (a check), or a size the
  round wanted, or before the centre's rows were converted; round 2 took another row when its own
  failed the rebuild's checks; round 2's additions went by score, their attempts' records left on the
  other machine. Each was judged again on relief views of the 04e90ef row, the centre at the same
  framing and the centre wider, the named place's anchor marked (PERFECT.md's Real places lines 1 to
  3):
  - of the 68 first maps from a sample (with Majuli): 35 built at their centre (Crater Lake, Mount
    Mayon, the Grand Canyon, Mount Fuji, Yosemite Valley, Ngorongoro, Aso Caldera and others; some
    at a wider or closer framing where only that shows the signature), 10 where the region's centre
    already was its second map (Colca Canyon, Torres del Paine, Uvac River, Drumheller, Blyde River
    Canyon, Glencoe, Bungle Bungle, Li River, Ilulissat Icefjord, Tara Gorge: the two lands swap
    names, no new land), and 23 kept on their sample (it shows the signature as well or better, or
    the region's other map covers the centre). Death Valley stays on its sample: its centre drains
    inward and the survey's routing finds no river, so it could hold no water source.
  - The 34: first maps as above; the rest back to their own land and height mapping, except
    Kyler's two swaps kept (Geirangerfjord at the fjord's centre; the whole glen at 60 m, now titled
    Glencoe) and Lake Saimaa at its centre.
  - Second maps that took another sample because their centre failed (Blyde River Canyon, Ilulissat
    Icefjord) are back at their centre, which now carries the place's name; their old first map is
    the second map, named by its part (#81's rule). No other second map had.
  - Seven regions' two maps now overlap by more than a quarter (Aso Caldera, Lake Toba, Ngorongoro,
    Mount Roraima, Hooker Valley, Monument Valley, Fish River Canyon): both kept, for Kyler to drop
    either.
  - **Majuli, Brahmaputra is back** (D245 (1): it was dropped for no mine site, a playability
    check), at its centre. 151 places; none dropped.
  - Every line is in the PR comment "Versions", for Kyler to overrule (default #84; what blocks
    and what is noted, default #85).
- **Result**: 151 places, 143 at 2× and 8 at 3.75× (256²); 8 starts moved to the water. Floor
  groves on 60 places (1,693 trees); **dead trees in them (pending #82): 67 trees on 9 places**
  (Green and Colorado 16, Twelve Apostles East 12, Lake Saimaa East 11, Yosemite Valley 10, Glencoe
  6, Phong Nha 4, Goosenecks of the San Juan 4, Torres del Paine 3, Skeidara Outwash 1), shown apart
  on the review sheet.
- **Tall places for the tall round** (D172; none built now): the places whose real relief at their
  scale spans more than 22 levels (relief ÷ metres a tile), so even tall compresses them: Tiger
  Leaping Gorge North, Colca Canyon, Mount Taranaki, Geirangerfjord East, Tiger Leaping Gorge,
  Paricutin Southwest, Torres del Paine East, Geirangerfjord, Roaring River Fan, Milford Sound,
  Mount Mayon, Aso Caldera East, Hooker Valley East, Torres del Paine, Blyde River Canyon North,
  Roaring River Fan East, Alaknanda and Bhagirathi, Lauterbrunnen, Drakensberg Amphitheatre, Mount
  Roraima East, Todgha Gorge, Crater Lake East, Mount Etna, the Grand Canyon, Lake Toba, Na Pali
  Coast, Mount Fuji, Mount Roraima, Toklat River North, Blue Mountains, Blue Mountains Southwest,
  Phong Nha Southwest, Blyde River Canyon, Todgha Gorge Southwest, Hooker Valley and Kate's Point
  (36); and 13 between 16 and 22, which tall would show at their real height (Ethiopian Highlands
  Southwest, Plitvice Lakes, Samosir, Aysen Fjord Southwest, Mount Mayon North, Aysen Fjord, Glencoe,
  Li River, Mount Taranaki North, Kawarau and Shotover, Aialik Bay, Death Valley, Glencoe North).
  Yosemite Valley spans 13 levels at its 120 m a tile; a tall version at 60 m would span about 21.
- **The grey area's probe group** (D245 (6); nothing launched): `npx tsx tools/places-probe.ts`
  writes Paricutin (96²), Badlands National Park (128²) and Lake Toba (256²), all "The water keeps
  moving", into `investigation/probe/local/places-moving/` and prints the batch: DGM Probe plays each
  as a Given map (3 temperate days, then Normal's longest first drought) and compares the start's
  water, sampled hourly, with the model.
- **The review sheet**, drawn again (`python tools/places-review.py docs/sheets/real-places-review
  --changed-since b2d9d2a`): each place's notes under its title in amber, the floor's groves with
  their dead trees apart, what changed since the sheet Kyler saw. Posted on #35
  (https://github.com/timbermods/dam-good-maps/pull/35#issuecomment-5852893380); the old one is
  marked out of date. Kyler picks drops from the new one only. The versions:
  https://github.com/timbermods/dam-good-maps/pull/35#issuecomment-5852892041.
- **Pictures**: every card drawn again on the GPU.

Tests updated to D245 (D148), none weakened; the absolutes stay blocking:
- `placesCommon.ts` (every place, nightly and in the release check; the sample on every push): the
  export profile passes; every generate-profile check that is not about playability passes (was:
  every check); the floor; the index's notes equal the checks' notes (new).
- `places.test.ts`: new "a place short of the playability checks still builds, loads, and says what
  it lacks" (a place noted for no pumpable water and one whose water keeps moving: the export
  profile passes, only playability checks fall short, its notes match); "notes only what would sink
  a player, in a few plain words"; "every place is on its own land: none dropped". The oracle
  comparison still checks both validators check by check; its pass expectation allows the
  playability checks (was: every sample place passes everything).
- `places.spec.ts`: new, a card lists its notes, and a card without any shows none.
- `randomOps.ts` (from `dev`, the nightly's property test): the random edits lacked a Carve run, so
  its sweep never found `carve` (in LOG_OPS since Live editing) and the nightly failed on #35. This
  branch drew one first; `dev` fixed it the same way (its `randomCarve`), which this branch took at
  the merge.
