// No sequence of edits adds an object (PLAN §20 D368 (10), D404), the nightly's sweep: every theme at
// 96² and 128², two seeds each, six sequences of two or three brushes and forces on each map, every
// object compared by id after every edit (editSequences.ts). Any new id fails, named with its map,
// its sequence and its step.

import { describe, expect, it } from "vitest";
import { THEMES } from "../../src/core/spec/mapspec";
import { sequences, sweepSequences } from "./editSequences";

describe("no sequence of edits adds an object, every theme (D368 (10), D404)", () => {
  for (const size of [96, 128])
    for (const theme of THEMES)
      it(`${theme} ${size}²: no edit in any sequence adds an object`, async () => {
        const failures: string[] = [];
        for (const seed of [2, 5]) failures.push(...(await sweepSequences(theme, size, seed, sequences(6, size, seed))));
        expect(failures).toEqual([]);
      }, 1_200_000);
});
