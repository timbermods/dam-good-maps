// The settings rows were laid out on the bar's thirteen cells; the Block tool's cell (7, after Naturalize's) and Erode's
// (the last) made it fifteen (D335, D281): each group stays over its buttons; the group that ends a row takes the new last
// cell, and the one that ended at Naturalize's takes Block's.

import { describe, expect, it } from "vitest";
import { fromThirteen, type Group } from "../../src/editor/settings";

const g = (at: number, span: number): Group => ({ key: "k", row: 1, at, span, node: null });

describe("a row laid out on thirteen cells, on fifteen", () => {
  it("the group ending the row takes Erode's cell", () => {
    expect(fromThirteen(g(12, 2))).toMatchObject({ at: 13, span: 3 });
    expect(fromThirteen(g(1, 13))).toMatchObject({ at: 1, span: 15 });
  });
  it("a group over the brushes stays, and one ending at Naturalize's takes Block's cell", () => {
    expect(fromThirteen(g(1, 3))).toMatchObject({ at: 1, span: 3 });
    expect(fromThirteen(g(4, 3))).toMatchObject({ at: 4, span: 4 });
  });
  it("a group over the forces moves one cell on, for Block's", () => {
    expect(fromThirteen(g(10, 2))).toMatchObject({ at: 11, span: 2 });
  });
});
