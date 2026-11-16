// The Real places check in shards (tools/lib/placeShards.ts, the Nightly's `places (i/n)` jobs): every place in exactly
// one shard, the same shards on every run, each shard with its share of every size.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claimOrder, parseShard, shardPlaces } from "../../tools/lib/placeShards";

// the library's places (the random-land controls are not places), as tools/real-places.ts reads them
const library = JSON.parse(readFileSync("investigation/landscapes/library/index.json", "utf8")) as { items: { family: string; size: number }[] };
const SIZES = library.items.filter((it) => it.family !== "random").map((it) => it.size);

describe("the places check's shards", () => {
  it("every place is in exactly one shard, each shard in the library's order", () => {
    for (const sizes of [SIZES, [128, 96, 256, 128, 256, 96, 128], [64], []])
      for (let n = 1; n <= 9; n++) {
        const seen = new Array(sizes.length).fill(0);
        for (let i = 1; i <= n; i++) {
          const ps = shardPlaces(sizes, { i, n });
          expect(ps).toEqual([...ps].sort((a, b) => a - b));
          for (const k of ps) seen[k]++;
        }
        expect(seen.every((c) => c === 1)).toBe(true);
      }
  });

  it("the same shards on every run, from the sizes and the library's order alone", () => {
    expect(shardPlaces(SIZES, { i: 2, n: 5 })).toEqual(shardPlaces([...SIZES], { i: 2, n: 5 }));
    expect(claimOrder([128, 256, 96, 256, 128])).toEqual([1, 3, 0, 4, 2]);
    expect(shardPlaces([128, 256, 96, 256, 128], { i: 1, n: 2 })).toEqual([0, 1, 2]);
    expect(shardPlaces([128, 256, 96, 256, 128], { i: 2, n: 2 })).toEqual([3, 4]);
  });

  it("each shard gets its share of every size", () => {
    for (let n = 2; n <= 8; n++)
      for (const size of new Set(SIZES)) {
        const counts = Array.from({ length: n }, (_, k) => shardPlaces(SIZES, { i: k + 1, n }).filter((p) => SIZES[p] === size).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
  });

  it("--shard takes i/n with 1 ≤ i ≤ n", () => {
    expect(parseShard("3/5")).toEqual({ i: 3, n: 5 });
    for (const bad of ["0/5", "6/5", "1/0", "a/b", "2", "1/2/3"]) expect(() => parseShard(bad)).toThrow(/--shard takes i\/n/);
  });
});
