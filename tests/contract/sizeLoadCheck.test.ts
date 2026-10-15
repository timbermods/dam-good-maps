// Contract (D357): the validator's load check `file.size` takes 4–512 a side and refuses beyond it, in one line;
// the file writer carries any size.

import { describe, expect, it } from "vitest";
import { buildFileFromHeights } from "../../src/core/places/place";
import { validateMap } from "../../src/core/validate/checks";

const sizeCheck = (W: number, H: number) => {
  const file = buildFileFromHeights(W, H, new Uint8Array(W * H).fill(6), [], "size").file;
  return validateMap(file, { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "file.size")!;
};

describe("file.size load check", () => {
  it.each([[4, 4], [512, 512], [128, 512], [512, 4]])("accepts %i×%i", (W, H) => {
    const c = sizeCheck(W, H);
    expect(c.ok).toBe(true);
    expect(c.message).toBe(`${W}×${H} tiles`);
  });

  it.each([[3, 64], [64, 513]])("refuses %i×%i in one line", (W, H) => {
    const c = sizeCheck(W, H);
    expect(c.ok).toBe(false);
    expect(c.message).toBe(`${W}×${H} tiles, the game takes 4–512 a side`);
  });
});
