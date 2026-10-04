// "Reached" is one core function (D342): the mine sites' check and the generator both read the land
// the colony reaches with `colonyReach`, and count the sites on it with `minesReached`.
import { describe, expect, it } from "vitest";
import type { MapObject } from "../../src/core/sim/model";
import { colonyReach, minesReached } from "../../src/core/validate/playability";

const W = 24;
const H = 12;
const obj = (template: string, x: number, y: number, z: number, orientation: MapObject["orientation"] = "Cw0"): MapObject => ({ template, x, y, z, orientation, flipped: false, components: {} });
const flat = (level: number) => new Uint8Array(W * H).fill(level);
const dry = () => new Uint8Array(W * H);
const start = { x: 3, y: 6 };
// (a mine site's footprint is 5×5 from its south-west corner at Cw0)
const mine = (x: number, y: number, z: number) => obj("UndergroundRuins", x, y, z);

describe("the land the colony reaches (colonyReach, minesReached)", () => {
  it("reaches a mine site on the start's own level", () => {
    const h = flat(4);
    const objects = [mine(15, 3, 4)];
    expect(minesReached(objects, W, H, colonyReach(W, H, h, dry(), objects, start))).toBe(1);
  });

  it("does not cross a river in its channel", () => {
    const h = flat(4);
    const wet = dry();
    for (let y = 0; y < H; y++) {
      h[y * W + 10] = 2;
      wet[y * W + 10] = 1;
    }
    const objects = [mine(15, 3, 4)];
    expect(minesReached(objects, W, H, colonyReach(W, H, h, wet, objects, start))).toBe(0);
  });

  it("does not climb a cliff, takes a step of one level as a flight of stairs, and walks up the map's own slopes", () => {
    const cliff = flat(4);
    const step = flat(4);
    for (let y = 0; y < H; y++)
      for (let x = 11; x < W; x++) {
        cliff[y * W + x] = 6;
        step[y * W + x] = 5;
      }
    expect(minesReached([mine(15, 3, 6)], W, H, colonyReach(W, H, cliff, dry(), [mine(15, 3, 6)], start))).toBe(0);
    expect(minesReached([mine(15, 3, 5)], W, H, colonyReach(W, H, step, dry(), [mine(15, 3, 5)], start))).toBe(1);
    // (a slope at the cliff's foot, its high side to the east)
    const sloped = [mine(15, 3, 6), obj("Slope", 10, 9, 4, "Cw270")];
    expect(minesReached(sloped, W, H, colonyReach(W, H, cliff, dry(), sloped, start))).toBe(1);
  });

  it("counts a site only when a tile beside it is reached", () => {
    const h = flat(4);
    const wet = dry();
    // a moat round the site
    for (let y = 2; y <= 8; y++)
      for (let x = 14; x <= 20; x++)
        if (x === 14 || x === 20 || y === 2 || y === 8) {
          h[y * W + x] = 2;
          wet[y * W + x] = 1;
        }
    const objects = [mine(15, 3, 4)];
    expect(minesReached(objects, W, H, colonyReach(W, H, h, wet, objects, start))).toBe(0);
  });
});
