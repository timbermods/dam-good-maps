// The intention table is the generator's (planning, 2026-11-14; src/core/land/intentionTable.ts): every intention asked
// of every theme on seeds 1–12 at 128² is counted again, and the committed table must be what the count gives. When the
// generator moves, `npm run intentions` writes the table afresh (and the descriptions and refusals follow it).

import { describe, expect, it } from "vitest";
import { INTENTION_TABLE } from "../../src/core/land/intentionTable";
import { computeTable } from "../../tools/lib/intentionTable";

describe("the intention table", () => {
  it("is what the generator gives now", async () => {
    expect(await computeTable()).toEqual(INTENTION_TABLE);
  }, 4 * 3_600_000);
});
