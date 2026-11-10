// The opening shot (D493): the game's first camera as a core question.
import { describe, expect, it } from "vitest";
import { bestTurn, frameAt, landInFrame, landmarkInView, levelDoorTurns, openingCamera, openingFrame, openingShotScore, prepareOpening } from "../../src/core/analysis/opening";
import { standingForms } from "../../src/core/analysis/vertical";
import { startMiddleTile } from "../../src/core/format/footprints";

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
    // (about 37 × 40 tiles: the target on height 0 puts the camera 36 levels over it, 26 over this land at level 10)
    expect(first.tiles.length).toBeGreaterThan(600);
    expect(first.tiles.length).toBeLessThan(1200);
    expect(vista.tiles.length).toBeGreaterThan(5 * first.tiles.length);
    // Cw90 looks toward +x: the frame reaches further east than west
    const xs = first.tiles.map((i) => i % W);
    expect(Math.max(...xs) - 64).toBeGreaterThan(64 - Math.min(...xs));
  });
});

/** The game's first camera on nine maps, as DGM Probe 0.3.4 recorded it (game 1.1.2.8; C:/dgm-probe/captures/<map>/
 *  captures.json, the "first" pose's `camera`, with the map's StartingLocation): the target (`stateTarget`) and the
 *  camera's place (`position`), in the game's world (x, height, grid y), and its zoom. */
const RECORDED = [
  { map: "caldera-lake-r3", x: 52, y: 50, z: 13, o: "Cw90", target: [59.6482, 0, 45.195], eye: [41.2146, 38.9769, 58.1024], zoom: 1.3 },
  { map: "four-lakes-r3", x: 69, y: 87, z: 3, o: "Cw0", target: [71.4935, 0, 89.9188], eye: [61.5647, 29.9822, 75.7391], zoom: 0.3 },
  { map: "four-lakes-r5", x: 67, y: 83, z: 3, o: "Cw0", target: [69.4935, 0, 85.9188], eye: [59.5647, 29.9822, 71.7391], zoom: 0.3 },
  { map: "four-lakes-r7-cave", x: 77, y: 96, z: 7, o: "Cw0", target: [80.8181, 0, 100.8106], eye: [69.7907, 33.2997, 85.0619], zoom: 0.7 },
  { map: "four-lakes-r7", x: 77, y: 96, z: 7, o: "Cw0", target: [80.8181, 0, 100.8106], eye: [69.7907, 33.2997, 85.0619], zoom: 0.7 },
  { map: "four-lakes-r8", x: 77, y: 97, z: 7, o: "Cw0", target: [80.8181, 0, 101.8106], eye: [69.7907, 33.2997, 86.0619], zoom: 0.7 },
  { map: "four-lakes-r9", x: 79, y: 100, z: 7, o: "Cw0", target: [82.8181, 0, 104.8106], eye: [71.7907, 33.2997, 89.0619], zoom: 0.7 },
  { map: "glacier-hollow-r2", x: 94, y: 29, z: 7, o: "Cw270", target: [90.1894, 0, 32.8181], eye: [105.9381, 33.2997, 21.7907], zoom: 0.7 },
  { map: "twin-falls-gorge-r2", x: 69, y: 32, z: 9, o: "Cw90", target: [74.7564, 0, 28.5196], eye: [58.1593, 35.0937, 40.1411], zoom: 0.9 },
] as const;

describe("the opening camera against the game's", () => {
  // the game centres on the district center's middle at its base level, then puts the target where that line of sight
  // meets height 0 (CameraTargeter.CenterCameraOn), the camera 32 × 1.3^(z × 0.1) back from it
  for (const r of RECORDED) {
    it(`${r.map}: the start at level ${r.z}, ${r.o}`, () => {
      const [mx, my] = startMiddleTile({ x: r.x, y: r.y, orientation: r.o });
      const cam = openingCamera({ x: mx, y: my, z: r.z, orientation: r.o });
      expect(Math.abs(cam.zoom - r.zoom)).toBeLessThan(1e-6);
      // grid (x, y, height) against the game's world (x, height, y), within 10⁻⁴ of a tile (the recorded values to four
      // decimals; the worst is 4.9 × 10⁻⁵)
      const err = Math.max(
        Math.abs(cam.target[0] - r.target[0]),
        Math.abs(cam.target[1] - r.target[2]),
        Math.abs(cam.target[2] - r.target[1]),
        Math.abs(cam.eye[0] - r.eye[0]),
        Math.abs(cam.eye[1] - r.eye[2]),
        Math.abs(cam.eye[2] - r.eye[1]),
      );
      expect(err).toBeLessThan(1e-4);
    });
  }
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

  it("how much of the frame shows the map (D507): most from the middle, least from a corner facing out", () => {
    const at = (x: number, y: number, o: "Cw0" | "Cw90" | "Cw180" | "Cw270") => landInFrame(128, 128, { x, y, z: 10, orientation: o });
    const mid = at(64, 64, "Cw0");
    expect(mid).toBeGreaterThan(0.65);
    expect(mid).toBeLessThan(0.8);
    // a corner start shows less, and least when its camera looks out past the corner
    const corner = ["Cw0", "Cw90", "Cw180", "Cw270"].map((o) => at(20, 20, o as "Cw0"));
    expect(Math.max(...corner)).toBeLessThan(mid - 0.15);
    expect(Math.min(...corner)).toBeLessThan(Math.max(...corner) - 0.1);
    // on a map large enough, every ray lands on it
    expect(landInFrame(1024, 1024, { x: 512, y: 512, z: 10, orientation: "Cw90" })).toBe(1);
  });
});
