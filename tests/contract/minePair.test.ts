// The mine sites the colony must reach are placed as a pair (D370's mine pair, item 47): the room
// check before them proves two level squares lie in the start's walk, but the first site was placed at
// random and could take the ground the second needed. They are placed again, each round on a stream of
// its own, until the colony reaches the two it must.
import { describe, expect, it } from "vitest";
import { sitesOnStrip } from "./minePairGround";

describe("the mine sites the colony must reach", () => {
  it("are placed as a pair where the ground holds one", () => {
    for (const seed of [1, 3]) expect(sitesOnStrip(seed), `seed ${seed}`).toBe(2);
  });
});
