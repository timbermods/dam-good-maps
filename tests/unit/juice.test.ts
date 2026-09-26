// Juice (PLAN §20 D205 (2)): every action gets its small answer on the land, never twice in a
// rush; the forces register their own; sounds are optional and remembered.

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUND, Juice, loadSound } from "../../src/editor/juice";
import type { MapRenderer } from "../../src/render3d";

function fakeRenderer() {
  const calls: string[] = [];
  const r = {
    puff: (x: number, y: number) => calls.push(`puff ${x},${y}`),
    ripple: (x: number, y: number) => calls.push(`ripple ${x},${y}`),
    wiggle: (tiles: number[]) => calls.push(`wiggle ${tiles.join(",")}`),
    mapState: () => ({ W: 10 }),
  } as unknown as MapRenderer;
  return { r, calls };
}

describe("the editor's juice", () => {
  it("each action has its effect on the land: dust for lowered ground, rings for a source, a wiggle for a placed object", () => {
    const { r, calls } = fakeRenderer();
    const j = new Juice(() => r, { on: false, volume: 0.5 });
    j.play("lower", 3, 4, 5);
    j.play("source", 1, 2);
    j.play("place", 2, 3);
    j.play("raise", 5, 5);
    expect(calls).toEqual(["puff 3,4", "ripple 1,2", "wiggle 32"]);
  });

  it("the same action again at once is skipped, not piled up", () => {
    const { r, calls } = fakeRenderer();
    const j = new Juice(() => r, { on: false, volume: 0.5 });
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    j.play("lower", 1, 1);
    now.mockReturnValue(1050);
    j.play("lower", 1, 1);
    now.mockReturnValue(1400);
    j.play("lower", 1, 1);
    now.mockRestore();
    expect(calls).toEqual(["puff 1,1", "puff 1,1"]);
  });

  it("a force brings its own touch, on the shared core", () => {
    const { r } = fakeRenderer();
    const j = new Juice(() => r, { on: false, volume: 0.5 });
    const seen: number[] = [];
    j.register("quake", ({ x, y, size }) => seen.push(x, y, size));
    j.play("quake", 7, 8, 3);
    expect(seen).toEqual([7, 8, 3]);
  });

  it("sounds are on and quiet unless the player turned them off", () => {
    expect(loadSound()).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND.on).toBe(true);
    expect(DEFAULT_SOUND.volume).toBeLessThanOrEqual(0.5);
  });
});
