# resources

How much of each resource a map carries, and where: trees, berry bushes, scrap, ruins, mine sites and badwater sources, as the official maps have them (Kyler's "Resources like the official maps").

**Rules**
- Amounts are the official median for the map's size, moved within the official range by the seed, then scaled by the Forests, Berries, Ruins and Badwater settings (`budget.ts`). The numbers come from `investigation/official-baselines.json`; regenerate them with `tools/official-baselines.ts`.
- Every map has at least one permanent badwater source unless the player chose "No badwater" (D200).
- The generator (`gen/resources.ts`) and Real places share this baseline.

**Start from**: `budget.ts` `resourceBudget`; `baseline.ts` `planGroves` (placement); `badwater.ts` `badwaterBudget`; `measure.ts` (`MAP_TREES`, `lownessAt`; the measures of any map alike are `tools/lib/resources.ts`); `plan.ts` `planMapResources` (the baseline on a map the generator did not plan).

**Tests**: `tests/contract/resources.test.ts`, `tests/contract/badwater.test.ts`. Run `npx vitest run tests/contract/resources.test.ts`.
