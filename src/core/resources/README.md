# resources

How much of each resource a map carries, and where: trees, berry bushes, scrap, ruins, mine sites and badwater sources, as the official maps have them (Kyler's "Resources like the official maps").

**Rules**
- Amounts are the official median for the map's size, moved within the official range by the seed, then scaled by the Forests, Berries, Ruins and Badwater settings (`budget.ts`). The numbers come from `investigation/official-baselines.json`; regenerate them with `tools/official-baselines.ts`.
- Every map has at least one permanent badwater source unless the player chose "No badwater" (D200).
- The generator (`gen/resources.ts`) ships this baseline: its amounts and planners, and the rules both compositions read from `baseline.ts` (`woodPerTree`, `succulentsOf`, `saplings`, `NEAR_WALK`, `startWalkField`). `plan.ts` `planMapResources` (with `badwater.ts` `pickBadwaterSprings`) is the composition for maps the generator did not plan: Real places' second round and Pick a place, both parked (D319), so only its tests call it today. It keeps its own badwater springs on ground as it stands, its own mine-site loop, dead trees on dry ground, and its trees keyed "resources" for saplings (the generator keys them by forest feature).

**Start from**: `budget.ts` `resourceBudget`; `baseline.ts` `planGroves` (placement); `badwater.ts` `badwaterBudget`; `measure.ts` (`MAP_TREES`, `lownessAt`; the measures of any map alike are `tools/lib/resources.ts`); `plan.ts` `planMapResources` (the baseline on a map the generator did not plan, parked).

**Tests**: `tests/contract/resources.test.ts`, `tests/contract/badwater.test.ts`. Run `npx vitest run tests/contract/resources.test.ts`.
