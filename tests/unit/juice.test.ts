// Juice (PLAN §20 D205 (2), D212, D220, D226): every action gets its small answer on the land, never
// twice in a rush; its sounds go to one engine (round two's: a brush's recorded bed for as long as the
// stroke lasts, an accent for a placement by its material, a force's phases once each, all of a
// force's sounds gone at once on Esc); sounds are on and clearly audible by default, and a player's
// saved choice is kept.

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
    // a grove painted: a quiet leaf bed while it paints; undo stops a stroke's bed, then its catch
    log.length = 0;
    j.strokeSound("tree", 2, 2, 4);
    j.undo();
    expect(log).toEqual(["start naturalize stroke", "stop stroke", "play undo"]);
  });

  it("a force's cues play once each; Esc stops every sound of it at once", () => {
    const { r } = fakeRenderer();
    const { e, log } = fakeEngine();
    const j = new Juice(() => r, DEFAULT_SOUND, e);
    // an impact: the breath as it falls, the crack and boom as it strikes, the stone as the debris
    // lands, once each however many frames say so
    for (const p of ["incoming", "incoming", "impact", "impact", "done"] as const) j.forceMoment(cue("craterize", p));
    j.forceEnded(true);
    expect(log.filter((l) => l.startsWith("play"))).toEqual(["play craterize:incoming", "play craterize:impact", "play craterize:debris"]);
    // a slide: its rumble and its grinding held, the crack and the splintering once; Esc stops the
    // beds and every accent of the run
    log.length = 0;
    for (const p of ["rumble", "slide", "slide", "slide"] as const) j.forceMoment(cue("quake", p));
    j.forceEnded(false);
    expect(log.filter((l) => l.startsWith("start")).length).toBe(2);
    expect(log.filter((l) => l === "play quake:crack").length).toBe(1);
    expect(log.filter((l) => l === "play slide").length).toBe(1);
    expect(log.filter((l) => l.startsWith("stop")).length).toBe(4);
    // an eruption kept: pressure, then its plume (its roar held while it swells), released for the
    // cooling hiss
    log.length = 0;
    j.forceMoment(cue("erupt", "rumble"));
    j.forceMoment(cue("erupt", "rise"));
    j.forceMoment(cue("erupt", "rise"));
    j.forceEnded(true, cue("erupt", "done"));
    expect(log.filter((l) => l.startsWith("play"))).toEqual(["play erupt:rumble", "play erupt:plume", "play erupt:cool"]);
    expect(log.filter((l) => l.startsWith("start"))).toEqual(["start erupt force-3-plume"]);
    expect(log.indexOf("stop force-3-plume")).toBeLessThan(log.indexOf("play erupt:cool"));
  });

  it("sounds are on at the round-two mix's own clearly audible level unless the player turned them off (D226), and a saved choice is kept as it is", () => {
    expect(loadSound()).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND).toEqual({ on: true, volume: 0.72, ambience: false });
    // the slider is the engine's master level, and the first default's (the engine's quiet 0.22) is
    // well below it
    expect(engineVolume(DEFAULT_SOUND.volume)).toBe(0.72);
    expect(engineVolume(1)).toBe(1);
    // a choice saved, off included, is kept as it is (an old saved volume is never raised)
    const { e } = fakeEngine();
    new Juice(() => null, loadSound(), e).setSound({ on: false, volume: 0.35 });
    expect(loadSound()).toEqual({ on: false, volume: 0.35, ambience: false });
    new Juice(() => null, loadSound(), e).setSound({ on: true, volume: 0.25 });
    expect(e.settingsSeen.at(-1)).toEqual({ enabled: true, volume: 0.25, ambience: false });
    localStorage.setItem("dgm.sound", JSON.stringify({ on: false, volume: 0.8 }));
    expect(loadSound()).toEqual({ on: false, volume: 0.8, ambience: false });
    localStorage.setItem("dgm.sound", JSON.stringify({ on: true, volume: 0.5 }));
    expect(loadSound()).toEqual({ on: true, volume: 0.5, ambience: false });
    localStorage.removeItem("dgm.sound");
  });
});
