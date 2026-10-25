// The opening shot (D493): the game's first camera as a core question.
import { describe, expect, it } from "vitest";
import { bestTurn, frameAt, landmarkInView, levelDoorTurns, openingCamera, openingFrame, openingShotScore, prepareOpening } from "../../src/core/analysis/opening";
import { standingForms } from "../../src/core/analysis/vertical";

const W = 128;
const H = 128;

/** Flat land at level 4 with a spire 11 levels over it at (px, py). */
function spireLand(px: number, py: number): Uint8Array {
  const h = new Uint8Array(W * H).fill(4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) h[(py + dy) * W + px + dx] = Math.abs(dx) + Math.abs(dy) <= 2 ? 15 : 10;
  return h;
}

describe("the opening camera", () => {
  it("looks along the start's orientation + 35°, from the door's side, 60° down", () => {
    const cam = openingCamera({ x: 64, y: 64, z: 10, orientation: "Cw0" });
    // Cw0: the game's horizontal angle 35°, looking toward +y and a little +x (its world z is our y)
    expect(cam.look[0]).toBeCloseTo(0.5736, 3);
    expect(cam.look[1]).toBeCloseTo(0.8192, 3);
    // ZoomLevel = z × 0.1, the distance 32 × 1.3^1
    expect(cam.distance).toBeCloseTo(41.6, 1);
    // the target is in the middle of the frame
    const t = frameAt(cam, cam.target[0], cam.target[1], cam.target[2])!;
    expect(Math.abs(t.u)).toBeLessThan(1e-9);
    expect(Math.abs(t.v)).toBeLessThan(1e-9);
    // a point ahead is higher in the frame than one behind
    expect(frameAt(cam, 64.5 + 5 * cam.look[0], 64.5 + 5 * cam.look[1], 11)!.v).toBeGreaterThan(0);
    expect(frameAt(cam, 64.5 - 5 * cam.look[0], 64.5 - 5 * cam.look[1], 11)!.v).toBeLessThan(0);
  });

  it("frames a few dozen tiles at the opening zoom, much more pulled back", () => {
    const first = openingFrame({ x: 64, y: 64, z: 10, orientation: "Cw90" }, W, H, { zoom: 1 });
    const vista = openingFrame({ x: 64, y: 64, z: 10, orientation: "Cw90" }, W, H);
    expect(first.tiles.length).toBeGreaterThan(1000);
    expect(first.tiles.length).toBeLessThan(2500);
    expect(vista.tiles.length).toBeGreaterThan(5 * first.tiles.length);
    // Cw90 looks toward +x: the frame reaches further east than west
    const xs = first.tiles.map((i) => i % W);
    expect(Math.max(...xs) - 64).toBeGreaterThan(64 - Math.min(...xs));
  });
});

describe("the opening shot", () => {
  it("finds the standing form", () => {
    const forms = standingForms(spireLand(90, 64), W, H);
    expect(forms.length).toBe(1);
    expect(forms[0].prominence).toBe(11);
    const px = forms[0].peak % W;
    const py = (forms[0].peak - px) / W;
    expect(Math.abs(px - 90) + Math.abs(py - 64)).toBeLessThanOrEqual(2);
  });

  it("turns a start toward a landmark 25–60 tiles out, among its level doors", () => {
    const h = spireLand(100, 64);
    const land = prepareOpening(h, W, H, null);
    const turns = levelDoorTurns(h, W, H, 60, 64, 4);
    expect(turns.length).toBe(4);
    // the spire stands 40 tiles east: Cw90 (looking +x, its door on the west) frames it beyond the
    // colony; Cw270 (looking −x) has it behind, low in the pulled-back frame: the foreground, not
    // the shot's backdrop
    const ahead = landmarkInView(land, { x: 60, y: 64, z: 4, orientation: "Cw90" })!;
    expect(ahead.stand).toBe(11);
    expect(ahead.v).toBeGreaterThan(0);
    expect(landmarkInView(land, { x: 60, y: 64, z: 4, orientation: "Cw270" })).toBeNull();
    const dWet = new Float64Array(W * H).fill(10);
    expect(bestTurn(land, 60, 64, 4, turns, dWet)).toBe("Cw90");
    expect(openingShotScore(land, { x: 60, y: 64, z: 4, orientation: "Cw90" }).score).toBeGreaterThan(openingShotScore(land, { x: 60, y: 64, z: 4, orientation: "Cw270" }).score);
    // too near is not in sight of the colony
    expect(landmarkInView(land, { x: 85, y: 64, z: 4, orientation: "Cw90" })).toBeNull();
  });

  it("keeps the door's rule: a door off level ground is never a turn", () => {
    const h = spireLand(100, 64);
    // Cw90's door is west of the 3×3 (x − 2): raise it
    h[64 * W + 58] = 5;
    expect(levelDoorTurns(h, W, H, 60, 64, 4).map((t) => t.o)).not.toContain("Cw90");
  });
});
