// The premises built but not offered (docs/PREMISES.md §7): each draws its plans for the tools and tests, but is not in
// `spec/mapspec.ts` `PREMISE_IDS`, so not in `PREMISE_CHOICES`, `PREMISES`, Any or a share link, until it makes a whole
// map (planning, 2026-11-11). Joining `PREMISE_IDS` is the step that offers one to players.

import type { PremiseDef } from "../types";
import { GATE_ID, wallGate } from "./wallGate";

export const DEV_PREMISES: Record<string, PremiseDef> = { [GATE_ID]: wallGate };
