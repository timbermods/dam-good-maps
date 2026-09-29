# The page is the editor

The brief is [docs/UI-BRIEF.md](../UI-BRIEF.md) (PLAN §20 D330); what's built and what the workspace wires is in
[EDITOR_PLAN.md](../../EDITOR_PLAN.md) §8, "The page is the editor: the parts built".

## Part 1: the parts on their own (2026-09-29, branch `feature/page-editor-1`)

Kyler, 2026-09-29: "only the new parts that don't touch src/editor/Editor.tsx or the files batches 1–3 are editing".
Built as new modules under `src/page/`, each with its own tests; nothing on the page uses them yet. Putting them into one
workspace, item 34's split into feature folders and the rows wait for the forces' release.

- **The side panel** (`panel/`): collapse to a strip, open on the first visit, then as left; the switch; Generate with
  its dot, only on the button or Enter.
- **The map card** (`card/`): name, how-it-plays line, the legend row with counts (hover names and highlights, click
  pins, handed to the workspace as `onHighlight`), the numbers line from M9b's `walkReach` and `levers`, a real place's
  signature and credits.
- **Your maps** (`yourMaps/`): IndexedDB storage, the background saver, the list; §6's quiet note (`QuietNote.tsx`).
- **The candidates strip** (`candidates/`): a reducer over M9b's candidate events, and the row.
- **The first-visit maps** (`firstVisit/`, `tools/first-visit-maps.ts`, `public/first-visit/`).
- **A workbench** (`workbench/index.html`, test builds only) mounts the parts for `tests/e2e/page-parts.spec.ts`.

**Defaults this step chose** (for Kyler's audit and the design pass):
- The lever marks' bands (`LEVER_BANDS` in `card/cardModel.ts`): farmland easier from 300 tiles, harder under 150;
  metal easier within 25 tiles, harder past 60 or none; badwater easier from 40 tiles or none, harder under 15; a
  sheltering dam easier up to 8 tiles, harder past 16 or none; building land easier from 400, harder under 200. Shown
  as three bars, more filled the harder the start.
- Your maps keeps 30 unstarred maps plus every starred one (the glossary's "the last 30; stars are kept for good"),
  and never drops the map just saved.
- No dot on Generate while a real place or an imported map is shown: it has no settings to differ from.
- Generate sits above the settings, so it's always in reach.
- The legend row's kinds and order: water and badwater sources, mine sites, ruins, berry bushes, trees, dead trees,
  relics, geothermal fields, unstable cores, thorns, blockages, slopes; never the start.
- The first-visit maps: one per named theme (six), each the first seed from 1 that passes, Designed for Normal.

**Interfaces left for integration:** EDITOR_PLAN.md §8, "What the workspace wires". Two need M9b: its `walkReach` and
`levers` must reach the page's response for the card (they are computed in `analysis` but not yet in
`GenerateResponse`), and the strip takes `version`, `runFindVersion` and `siblingSpec` from M9b's worker API.
