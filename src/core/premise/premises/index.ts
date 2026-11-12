// The premises (docs/PREMISES.md §4 to §6): one definition each. Build step 1 has the lake stair's stage 0.

import type { PremiseDef, PremiseId } from "../types";
import { lakeStair } from "./lakeStair";

export const PREMISES: Record<PremiseId, PremiseDef> = { lakeStair };
