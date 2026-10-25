// Toggling top-down keeps the spot looked at and the zoom (D492): the switch changes only the tilt. The distance is
// converted so the ground scale at the centre of the view stays (the two cameras' scales differ), and going there and
// back gives the view back exactly.

import { describe, expect, it } from "vitest";
import { distanceForMode, ORTHO_HALF_PER_DISTANCE, PERSP_FOV_DEG, viewAfterModeSwitch } from "../../src/render3d/framing";

const limits = { min: 6, max: 288 };
const angled = { mode: "orbit" as const, yaw: -0.7, pitch: 0.9, distance: 120, target: [40, 6, -52] as [number, number, number] };

describe("viewAfterModeSwitch", () => {
  it("keeps the target, the turn and the tilt of the angled view; only the mode and the distance change", () => {
    const top = viewAfterModeSwitch(angled, "top", limits);
    expect(top.mode).toBe("top");
    expect(top.target).toEqual(angled.target);
    expect(top.yaw).toBe(angled.yaw);
    expect(top.pitch).toBe(angled.pitch);
  });

  it("keeps the ground scale at the centre: the same ground across the canvas's width in both views", () => {
    const top = viewAfterModeSwitch(angled, "top", limits);
    const groundAcross = (mode: "orbit" | "top", d: number) => (mode === "top" ? 2 * ORTHO_HALF_PER_DISTANCE * d : 2 * d * Math.tan((PERSP_FOV_DEG * Math.PI) / 360));
    expect(groundAcross("top", top.distance)).toBeCloseTo(groundAcross("orbit", angled.distance), 9);
  });

  it("toggled there and back gives the view back", () => {
    const back = viewAfterModeSwitch(viewAfterModeSwitch(angled, "top", limits), "orbit", limits);
    expect(back.mode).toBe("orbit");
    expect(back.distance).toBeCloseTo(angled.distance, 9);
    expect(back.target).toEqual(angled.target);
    expect(back.yaw).toBe(angled.yaw);
  });

  it("is a no-op in the mode it is already in", () => {
    expect(viewAfterModeSwitch(angled, "orbit", limits)).toBe(angled);
  });

  it("holds the distance to the zoom's limits, but does not snap one already past a limit", () => {
    expect(viewAfterModeSwitch({ ...angled, distance: 6.5 }, "top", limits).distance).toBe(6);
    expect(viewAfterModeSwitch({ ...angled, mode: "top" as const, distance: 280 }, "orbit", limits).distance).toBe(288);
    // a framing wider than the farthest limit stays as wide
    expect(viewAfterModeSwitch({ ...angled, distance: 400 }, "top", limits).distance).toBeCloseTo(distanceForMode(400, "top"), 9);
    expect(viewAfterModeSwitch({ ...angled, distance: 400 }, "top", limits).distance).toBeGreaterThan(288);
  });
});
