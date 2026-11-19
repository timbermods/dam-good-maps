// The poisoned floodplain's old channels leave its levees whole (docs/design/poisoned-floodplain.md §1, "The old
// channels"): on seeds 1 to 12 at 128², 192² and 256², no channel's bed lies on a levee or its flank (the river's levee
// banks and the ladder's levees, and 2 tiles round them) or on any other work's site or its flank (the turn, the weir,
// the pond), and every levee's crest stands as it does with the channels left uncut. A levee is the thing the player
// breaks or raises by paid work; a channel lowering its flank would do it for free, and no check reads it. Before the
// mend (step 6's review) 22 of the 36 maps' channels lay on a levee or its flank, on 13 of them lowering it.

import { describe, expect, it } from "vitest";
import { plainLand } from "../../src/core/premise/plainLand";
import { OLD_CHANNELS, plainWorksOf } from "../../src/core/premise/plainMap";
import { rulesFor } from "../../src/core/validate/playability";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("The poisoned floodplain's old channels leave its levees whole", () => {
  for (const side of [128, 192, 256])
    it(`seeds 1 to 12 at ${side}²`, () => {
      const hits: string[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
        const land = plainLand(spec);
        if ("reason" in land) continue;
        const { W, H } = land.plan;
        const bench = rulesFor(spec).levelLand;
        const on = plainWorksOf(land, bench);
        const off = plainWorksOf(land, bench, false);
        const levees = (g: typeof on) => g.ladder.works.filter((w) => w.kind === "levee");
        // (the levees: the river's banks over the land and the ladder's levee sites, with and without the channels)
        const crest = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) if (land.relief.bank[i] > 0) crest[i] = 1;
        for (const w of [...levees(on), ...levees(off)]) for (const i of w.tiles) crest[i] = 1;
        const site = Uint8Array.from(crest);
        for (const w of [...on.ladder.works, ...off.ladder.works]) for (const i of w.tiles) site[i] = 1;
        const flank = new Uint8Array(W * H);
        const L = OLD_CHANNELS.lip;
        for (let i = 0; i < W * H; i++) {
          if (!site[i]) continue;
          const x = i % W;
          const y = (i - x) / W;
          for (let dy = -L; dy <= L; dy++)
            for (let dx = -L; dx <= L; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) flank[(y + dy) * W + x + dx] = 1;
        }
        const bed = on.washes.flatMap((w) => w.tiles).filter((i) => flank[i]);
        if (bed.length) hits.push(`seed ${seed}: ${bed.length} bed tiles on a levee or a work's site, or its flank (first ${bed[0] % W},${Math.floor(bed[0] / W)})`);
        let lowered = 0;
        for (let i = 0; i < W * H; i++) if (crest[i] && on.heights[i] !== off.heights[i]) lowered++;
        if (lowered) hits.push(`seed ${seed}: ${lowered} levee tiles' heights moved`);
        const sites = (g: typeof on) => JSON.stringify(levees(g).map((w) => [w.id, w.level, [...w.tiles].sort((a, b) => a - b)]));
        if (sites(on) !== sites(off)) hits.push(`seed ${seed}: a ladder levee's site or crest moved`);
      }
      expect(hits).toEqual([]);
    }, 900_000);
});
