# library

The player's maps around the one shown ("The page is the editor", PLAN §20 D330, D234, D329): Your maps' model and its background saving, the candidates strip's state, and the ready-made first-visit maps. Plain data and functions (D342): the page's side panel shows them; nothing here needs a page.

**Rules**
- Nothing here changes a map. Your maps keeps project files as they are; the strip and the first-visit maps only choose among maps the generator made.
- Every refusal says why in a plain line (`storeProblem`, `firstVisitProblems`).
- The strip never swaps the shown map: only the player opens a candidate (D329).

**Start from**
- `yourMaps.ts`: the entry, every map is kept until the player deletes it, `storeProblem`. The IndexedDB store is `src/platform/yourMaps.ts`.
- `saver.ts` `YourMapsSaver`: saves after edits settle, one snapshot per burst, never waited on.
- `strip.ts` `strip`: the candidates strip's state over M9b's candidate events.
- `firstVisit.ts`: the index format, `pickFirstVisit` (the caller passes the random number: the core has none of its own, D366), and what makes one (`firstVisitProblems`, `reopensAs`, `makeFirstVisit`; `tools/first-visit-maps.ts` runs it in the deploy, D343).
- `when.ts` `whenText`: "Edited 5 minutes ago".

**Tests**: `tests/contract/yourMaps.test.ts`, `candidatesStrip.test.ts`, `firstVisit.test.ts`. Run `npx vitest run tests/contract/yourMaps.test.ts`.
