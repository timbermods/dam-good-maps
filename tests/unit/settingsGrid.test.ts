// The settings rows were laid out on the bar's thirteen cells; Erode's cell made it fourteen (D281): the group that ends a
// row takes the new last cell, every other group stays over the buttons it was over.

import { describe, expect, it } from "vitest";
import { fromThirteen, type Group } from "../../src/editor/settings";

const g = (at: number, span: number): Group => ({ key: "k", row: 1, at, span, node: null });

describe("a row laid out on thirteen cells, on fourteen", () => {
  it("the group ending the row takes the extra cell", () => {
    expect(fromThirteen(g(12, 2))).toMatchObject({ at: 12, span: 3 });
    expect(fromThirteen(g(1, 13))).toMatchObject({ at: 1, span: 14 });
  });
  it("the others stay where they were", () => {
    expect(fromThirteen(g(1, 3))).toMatchObject({ at: 1, span: 3 });
    expect(fromThirteen(g(10, 2))).toMatchObject({ at: 10, span: 2 });
  });
});
