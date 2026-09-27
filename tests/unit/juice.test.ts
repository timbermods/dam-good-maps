// Juice (PLAN §20 D205 (2), D212, D220): every action gets its small answer on the land, never twice in
// a rush; its sounds go to one engine (a brush's texture for as long as the stroke lasts, an accent
// for a placement, a force's cues once each, all of a force's sounds gone at once on Esc); sounds are
// on and quiet by default, and a player's saved choice is kept.

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUND, engineVolume, Juice, loadSound, placeSound, type SoundEngine } from "../../src/editor/juice";
import type { ForceCue } from "../../src/core/forces/runs";
import type { MapRenderer } from "../../src/render3d";

function fakeRenderer() {
  const calls: string[] = [];
  const r = {
    puff: (x: number, y: number) => calls.push(`puff ${x},${y}`),
    ripple: (x: number, y: number) => calls.push(`ripple ${x},${y}`),
    wiggle: (tiles: number[]) => calls.push(`wiggle ${tiles.join(",")}`),
    mapState: () => ({ W: 10 }),
    soundPlace: () => ({ distance: 0.1, pan: 0 }),
  } as unknown as MapRenderer;
  return { r, calls };
}

function fakeEngine() {
  const log: string[] = [];
  const e: SoundEngine & { settingsSeen: unknown[] } = {
    settingsSeen: [],
    unlock: async () => true,
    play: (name, _p, o) => (log.push(`play ${name}${o?.phase ? ":" + o.phase : ""}`), o?.id ?? 1),
    start: (name, _p, id) => (log.push(`start ${name} ${id}`), id ?? "x"),
    update: (id) => void log.push(`update ${id}`),
    stop: (id) => void log.push(`stop ${id}`),
    stopAll: () => void log.push("stopAll"),
    setSettings: (s) => void e.settingsSeen.push(s),
    pause: () => void log.push("pause"),
    dispose: () => undefined,
  };
  return { e, log };
}

const cue = (verb: ForceCue["verb"], phase: ForceCue["phase"]): ForceCue => ({ verb, phase, progress: 0.5, x: 3, y: 3, z: 5, size: 20, power: 60 });

// a page's storage, for the saved choice
const stored = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) });
afterEach(() => stored.clear());

describe("the editor's juice", () => {
  it("each action has its effect on the land: dust for lowered ground, rings for a source, a wiggle for a placed object", () => {
    const { r, calls } = fakeRenderer();
    const j = new Juice(() => r, { on: false, volume: 0.5 }, fakeEngine().e);
    j.play("lower", 3, 4, 5);
    j.play("source", 1, 2);
    j.play("place", 2, 3);
    j.play("raise", 5, 5);
    expect(calls).toEqual(["puff 3,4", "ripple 1,2", "wiggle 32"]);
  });

  it("the same action again at once is skipped, not piled up", () => {
    const { r, calls } = fakeRenderer();
    const j = new Juice(() => r, { on: false, volume: 0.5 }, fakeEngine().e);
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

  it("each placement has its own accent: a tree's pop, a bush's pluck, a ruin's clank, a source's gurgle", () => {
    const { r } = fakeRenderer();
    const { e, log } = fakeEngine();
    const j = new Juice(() => r, DEFAULT_SOUND, e);
    j.play("place", 1, 1, 1, false, "Pine");
    j.play("source", 1, 1, 1, false, "badwater");
    expect(log).toEqual(["play tree", "play badwater"]);
    expect(["Birch", "BlueberryBush", "RuinColumnH3", "UndergroundRuins", "StartingLocation", "LargeRelic"].map(placeSound)).toEqual(["tree", "berry", "ruin", "mine", "start", "ruin"]);
  });

  it("a brush stroke is one texture from its first change of the land to its end, never a pile of accents", () => {
    const { r } = fakeRenderer();
    const { e, log } = fakeEngine();
    const j = new Juice(() => r, DEFAULT_SOUND, e);
    j.strokeSound("flatten", 2, 2, 6);
    for (let k = 0; k < 5; k++) j.strokeSound("flatten", 2 + k, 2, 6);
    j.play("shape", 3, 3, 6, false);
    j.strokeEnd();
    expect(log.filter((l) => l.startsWith("start"))).toEqual(["start flatten stroke"]);
    expect(log.filter((l) => l.startsWith("update")).length).toBe(5);
    expect(log.filter((l) => l.startsWith("play"))).toEqual([]);
    expect(log.at(-1)).toBe("stop stroke");
  });

  it("a force's cues play once each; Esc stops every sound of it at once", () => {
    const { r } = fakeRenderer();
    const { e, log } = fakeEngine();
    const j = new Juice(() => r, DEFAULT_SOUND, e);
    // an impact: the whistle, then the impact, once each however many frames say so
    for (const p of ["incoming", "incoming", "impact", "impact", "done"] as const) j.forceMoment(cue("craterize", p));
    j.forceEnded(true);
    expect(log.filter((l) => l.startsWith("play"))).toEqual(["play craterize:incoming", "play craterize:impact"]);
    // a slide: its rumble and its grinding held, the crack once; Esc stops both and the run
    log.length = 0;
    for (const p of ["rumble", "slide", "slide", "slide"] as const) j.forceMoment(cue("quake", p));
    j.forceEnded(false);
    expect(log.filter((l) => l.startsWith("start")).length).toBe(2);
    expect(log.filter((l) => l === "play quake:crack").length).toBe(1);
    expect(log.filter((l) => l.startsWith("stop")).length).toBe(3);
    // an eruption kept: its rumble stops, and it cools with a hiss
    log.length = 0;
    j.forceMoment(cue("erupt", "rumble"));
    j.forceMoment(cue("erupt", "rise"));
    j.forceEnded(true, cue("erupt", "done"));
    expect(log).toContain("play erupt:plume");
    expect(log.at(-1)).toBe("play erupt:cool");
  });

  it("sounds are on and clearly audible unless the player turned them off (D226), and a saved choice is kept", () => {
    expect(loadSound()).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND.on).toBe(true);
    expect(DEFAULT_SOUND.ambience).toBe(false);
    // louder than the first default (the engine's quiet 0.22): about ten decibels, roughly twice as
    // loud to the ear; the engine's limiter keeps it below full scale
    expect(20 * Math.log10(engineVolume(DEFAULT_SOUND.volume) / 0.22)).toBeGreaterThanOrEqual(9);
    expect(engineVolume(1)).toBeLessThanOrEqual(1);
    // a choice saved now is kept as it is
    const { e } = fakeEngine();
    new Juice(() => null, loadSound(), e).setSound({ on: false, volume: 0.35 });
    expect(loadSound()).toEqual({ on: false, volume: 0.35, ambience: false });
    new Juice(() => null, loadSound(), e).setSound({ on: true, volume: 0.25 });
    expect(e.settingsSeen.at(-1)).toEqual({ enabled: true, volume: 0.25, ambience: false });
    // saved before D226: off stays off, a volume set keeps its loudness, the first default never
    // moved becomes the new one
    localStorage.setItem("dgm.sound", JSON.stringify({ on: false, volume: 0.8 }));
    expect(loadSound()).toEqual({ on: false, volume: 0.35, ambience: false });
    localStorage.setItem("dgm.sound", JSON.stringify({ on: true, volume: 0.5 }));
    expect(loadSound()).toEqual({ on: true, volume: DEFAULT_SOUND.volume, ambience: false });
    localStorage.removeItem("dgm.sound");
  });
});
