// A batch placement holds to the same rule as a single one (#755): the resources (forests, berry patches, ruin
// fields) make room for what a player places, so a tile one of them covers takes a placement in a batch as it
// does alone; only the batch's own objects are kept apart from each other.

import { describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import { resourceOwners } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 64;
const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
const GUID = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const pine = (n: number, x: number, y: number): EditOp => ({ op: "placeEntity", params: { id: GUID(n), template: "Pine", x, y, orientation: "Cw0" } }) as EditOp;

describe("a placement batch keeps the single placement's rule (#755)", () => {
  it("a pine on a tile a resource covers, which check accepts alone, goes in a batch too; two of the batch on one tile do not", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const owners = resourceOwners(s);
    const resource = s.built.entities.find((e) => owners.has(e.owner) && e.x > 0 && e.y > 0 && !s.check(pine(1, e.x, e.y)).length);
    expect(resource, "a resource's tile that takes a pine").toBeDefined();
    const { x, y } = resource!;
    // a second pine on plain free ground away from it
    let other: EditOp | null = null;
    for (let i = 0; !other && i < W * W; i += 7) {
      const op = pine(2, i % W, Math.floor(i / W));
      if (Math.abs((i % W) - x) + Math.abs(Math.floor(i / W) - y) > 2 && !s.check(op).length) other = op;
    }
    expect(other).not.toBeNull();
    // (two of the batch on the one tile are refused, as before)
    const twice = s.applyBatch([pine(1, x, y), pine(3, x, y)]);
    expect(twice.ok).toBe(false);
    expect(twice.errors).toEqual(["another object stands in the placement's footprint"]);
    const batch = s.applyBatch([pine(1, x, y), other!], "user", "Plant 2 pines");
    expect(batch.errors).toEqual([]);
    expect(s.built.entities.some((e) => e.id === GUID(1) && e.x === x && e.y === y)).toBe(true);
  });
});
