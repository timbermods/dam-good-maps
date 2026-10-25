// Programs compiled before a frame needs them (programs.ts, D453): a material's defines are its program's name, order
// included, so the branches a map gains in any order must come out in one order, or a program compiled ahead is not
// the one the switch asks for and the frame compiles it again.

import { describe, expect, it } from "vitest";
import { withDefine } from "../../src/render3d/programs";

describe("withDefine", () => {
  it("writes the same branches in the same order whichever came first, the material's own first", () => {
    const own = { LITE: 0, CUTAWAY: 0 };
    const a = withDefine(withDefine(withDefine(own, "RUN_SOIL", 1), "CAVES", 1), "CUTAWAY", 1);
    const b = withDefine(withDefine(withDefine(own, "CUTAWAY", 1), "CAVES", 1), "RUN_SOIL", 1);
    expect(JSON.stringify(a)).toBe('{"LITE":0,"CUTAWAY":1,"CAVES":1,"RUN_SOIL":1}');
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // a branch taken out and put back: the same again
    expect(JSON.stringify(withDefine(withDefine(a, "CAVES", null), "CAVES", 1))).toBe(JSON.stringify(a));
    expect(withDefine(a, "CAVES", null)).toEqual({ LITE: 0, CUTAWAY: 1, RUN_SOIL: 1 });
  });
});
