import type { Case } from "./cases";
import type { ErodeMap } from "../core/map";

// Kyler described the route rather than providing pointer coordinates: pin this close replay.
export const KYLER_XY = [[111, 104], [106, 112], [93, 112], [87, 105], [89, 96], [98, 93],
  [106, 97], [109, 105], [109, 114], [109, 121], [99, 123], [88, 120], [81, 115], [77, 107], [73, 98]];
export function kylerCase(m?: ErodeMap): Case {
  return { id: "crater-long-sweep", title: "Crater → Kyler's long sweep", map: "crater",
    gesture: "Loop around the crater mound, cross the rim and plateau, and finish at the cliff foot",
    points: KYLER_XY.map(([x, y], k) => ({ x: x + 0.5, y: y + 0.5,
      z: (m ? m.heights[y * m.W + x] : [7,7,7,7,7,7,7,7,14,19,19,18,16,13,8][k]) - 0.5, nz: 1 })),
    power: 72, size: null, seed: 1,
    overview: { target: [98, 9, -106], yaw: -0.65, pitch: 0.72, distance: 83, fov: 50 },
    low: { target: [105, 8, -109], yaw: -0.8, pitch: 0.04, distance: 25, fov: 65 }, lowName: "Along the sweep" };
}

/** Seeded long strokes for the lean support/timing sweep, all on the original 128² maps. */
export function longSweep(m: ErodeMap, kind: "crater" | "plateau" | "canyon", offset = 0) {
  const xy = kind === "crater" ? KYLER_XY : kind === "plateau" ?
    [[18, 28], [41, 32], [53, 45], [43, 61], [58, 77], [80, 82], [105, 103]] :
    [[92, 23], [90, 40], [96, 55], [93, 71], [88, 89], [98, 106]];
  return xy.map(([x, y]) => {
    x = Math.max(2, Math.min(m.W - 3, x + offset)); y = Math.max(2, Math.min(m.H - 3, y - offset));
    return { x: x + .5, y: y + .5, z: m.heights[y * m.W + x] - .5, nz: 1 };
  });
}
