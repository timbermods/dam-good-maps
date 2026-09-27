// The editor's sounds, round two (PLAN §20 D226; investigation/juice-2, #64): every recording is the
// bank's own, traceable and intact; every recipe uses them; runs climb to a fifth and reset; each
// force phase has its own material; distance lowers and darkens. The engine is silent until the
// first gesture, then loads the bank lazily (four at a time); a sound asked for while it loads is
// dropped, never played late; stop and Esc cut a force's sounds, the page hidden stops everything;
// off is off. Nothing on the editor's input path waits for audio.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BANK_IDS, bankUrl } from "../../src/editor/juice/bank";
import { JuiceEngine, LIMITS } from "../../src/editor/juice/engine";
import { LADDER, parameters, recipe, RewardRuns, SOUNDS, spatial, texture } from "../../src/editor/juice/palette";
import { Juice } from "../../src/editor/juice";
import type { ForceCue } from "../../src/core/forces/runs";

const DIR = "public/sounds/juice-2";

describe("the sound bank (D226)", () => {
  it("is Codex's CC0 foley, each file intact against its manifest, with its credits beside it, small enough to load on the first gesture", () => {
    const manifest = JSON.parse(readFileSync(`${DIR}/bank.json`, "utf8")) as { id: string; file: string; sha256: string; bytes: number; provenance: string; sources: unknown[] }[];
    expect(manifest.map((m) => m.id)).toEqual(BANK_IDS);
    let bytes = 0;
    for (const m of manifest) {
      expect(m.file).toBe(`audio/${m.id}.mp3`);
      const data = readFileSync(`${DIR}/${m.file}`);
      expect(createHash("sha256").update(data).digest("hex"), m.id).toBe(m.sha256);
      expect(data.length).toBe(m.bytes);
      expect(m.provenance && m.sources.length).toBeTruthy();
      bytes += statSync(`${DIR}/${m.file}`).size;
    }
    expect(bytes).toBe(818_400);
    const credits = readFileSync(`${DIR}/SOUNDS.md`, "utf8");
    expect(credits).toMatch(/CC0 1\.0/);
    for (const who of ["Kenney", "Independent.nu", "ezwa", "TinyWorlds", "Tom_Kaszuba", "SamsterBirdies"]) expect(credits).toContain(who);
    // (the same bank as the round's own)
    for (const id of BANK_IDS) expect(readFileSync(`${DIR}/audio/${id}.mp3`).equals(readFileSync(`investigation/juice-2/audio/${id}.mp3`)), id).toBe(true);
    expect(bankUrl("audio/wood-a.mp3")).toMatch(/sounds\/juice-2\/audio\/wood-a\.mp3$/);
    expect(existsSync("src/editor/juice/synth.ts") || existsSync("src/editor/juice/worklet.ts")).toBe(false);
  });

  it("every recipe and bed uses the bank's recordings, bounded; runs climb to a fifth and reset; each force phase is its own; distance lowers and darkens", () => {
    const ids = new Set(BANK_IDS);
    expect(SOUNDS.length).toBe(22);
    for (const sound of SOUNDS)
      for (let i = 0; i < 20; i++) {
        const layers = recipe(sound.id, { size: i / 20, strength: i / 20 });
        expect(layers.length > 0 && layers.length <= 16, sound.id).toBe(true);
        for (const layer of [...layers, ...texture(sound.id)]) {
          expect(ids.has(layer.sample), layer.sample).toBe(true);
          expect(Number.isFinite(layer.rate ?? 1) && (layer.rate ?? 1) > 0 && (layer.rate ?? 1) < 3).toBe(true);
          expect(Number.isFinite(layer.gain) && layer.gain > 0).toBe(true);
        }
      }
    const runs = new RewardRuns();
    expect([0, 0.2, 0.4, 0.6, 0.8].map((t) => runs.next("tree", t))).toEqual([0, 2, 4, 7, 7]);
    expect(LADDER.at(-1)).toBe(7);
    expect(runs.next("berry", 0.9)).toBe(0);
    expect(runs.next("tree", 1.7)).toBe(0);
    for (const [name, phases] of [
      ["craterize", ["incoming", "impact", "debris"]],
      ["erupt", ["rumble", "plume", "cool"]],
      ["glaciate", ["advance", "retreat"]],
    ] as const)
      for (const phase of phases) {
        const layers = recipe(name, {}, { phase });
        expect(layers.length, `${name} ${phase}`).toBeGreaterThan(0);
        expect(Math.min(...layers.map((l) => l.delay ?? 0))).toBeLessThan(0.04);
      }
    const near = spatial(parameters({}));
    const far = spatial(parameters({ distance: 2 }));
    expect(far.gain).toBeLessThan(near.gain / 5);
    expect(far.cutoff).toBeLessThan(near.cutoff / 5);
    for (const v of [NaN, Infinity, -100, 100]) {
      const p = parameters({ size: v, strength: v, pan: v, distance: v });
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(spatial(p).gain).toBeGreaterThanOrEqual(0);
    }
  });
});

// ------------------------------------------------------------------------------ a fake audio clock

class Param {
  value: number;
  calls: string[] = [];
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelAndHoldAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class Node {
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}

class FakeContext {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  sampleRate = 48000;
  destination = new Node();
  started: FakeSource[] = [];
  stopped = 0;
  resumeGate: Promise<void> = Promise.resolve();
  createGain() {
    return Object.assign(new Node(), { gain: new Param(1) });
  }
  createBiquadFilter() {
    return Object.assign(new Node(), { type: "lowpass", frequency: new Param(18000), Q: new Param(1) });
  }
  createStereoPanner() {
    return Object.assign(new Node(), { pan: new Param(0) });
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() });
  }
  createWaveShaper() {
    return Object.assign(new Node(), { curve: null as Float32Array | null, oversample: "none" });
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { duration: length / rate, length, sampleRate: rate, getChannelData: () => data };
  }
  createBufferSource() {
    const s = new FakeSource(this);
    return s;
  }
  async decodeAudioData() {
    return this.createBuffer(1, 24000, 48000);
  }
  async resume() {
    await this.resumeGate;
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}

class FakeSource extends Node {
  buffer: unknown = null;
  loop = false;
  playbackRate = new Param(1);
  onended: (() => void) | null = null;
  constructor(private readonly ctx: FakeContext) {
    super();
  }
  start() {
    this.ctx.started.push(this);
  }
  stop() {
    this.ctx.stopped++;
  }
}

/** A fetcher that answers each file after `gate`, counting requests in flight. */
function fakeFetch(gate: () => Promise<void> = async () => undefined) {
  const seen: string[] = [];
  let inFlight = 0;
  let most = 0;
  const fetcher = async (url: string) => {
    seen.push(url);
    inFlight++;
    most = Math.max(most, inFlight);
    await gate();
    inFlight--;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
  };
  return { fetcher, seen, most: () => most };
}

vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
vi.stubGlobal("requestAnimationFrame", (f: () => void) => (setTimeout(f, 0) as unknown as number) || 1);
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
afterEach(() => {
  (document as unknown as { hidden: boolean }).hidden = false;
});

describe("the sound engine (round two)", () => {
  it("is silent until the first gesture (its context made ready as the editor opens), then loads the bank four at a time; a sound asked for while it loads is dropped, never played late", async () => {
    let made = 0;
    const ctx = new FakeContext();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fakeFetch(() => gate);
    const e = new JuiceEngine({}, f.fetcher, () => (made++, ctx as unknown as AudioContext));
    expect(made).toBe(0);
    expect(e.play("tree")).toBeNull();
    // made ready as the editor opens: the context only (its device opens then, never on a
    // gesture), nothing fetched, nothing played
    e.prepare();
    expect(made).toBe(1);
    expect(f.seen.length).toBe(0);
    expect(e.play("tree")).toBeNull();
    const loading = e.unlock();
    expect(made).toBe(1);
    await Promise.resolve();
    // loading: nothing plays, nothing waits
    expect(e.play("tree")).toBeNull();
    expect(e.start("raise", {}, "stroke")).toBeNull();
    expect(f.most()).toBeLessThanOrEqual(4);
    release();
    expect(await loading).toBe(true);
    expect(f.seen.length).toBe(BANK_IDS.length);
    expect(f.most()).toBeLessThanOrEqual(4);
    expect(f.most()).toBeGreaterThan(1);
    // nothing asked for during the load plays now
    expect(ctx.started.length).toBe(0);
    expect(e.play("tree")).not.toBeNull();
    expect(ctx.started.length).toBeGreaterThan(0);
  });

  it("a force's run is cut at once (Esc), its later phases included; the page hidden stops everything and sleeps; off is silent; bursts are bounded", async () => {
    const ctx = new FakeContext();
    const e = new JuiceEngine({ volume: 0.72 }, fakeFetch().fetcher, () => ctx as unknown as AudioContext);
    await e.unlock();
    const run = e.play("craterize", {}, { id: "run", phase: "incoming" });
    expect(run).toBe("run");
    expect(e.play("craterize", {}, { id: "run", phase: "impact" })).toBe("run");
    const bed = e.start("quake", {}, "bed");
    expect(bed).toBe("bed");
    const before = ctx.stopped;
    e.stop("run");
    expect(ctx.stopped).toBeGreaterThan(before);
    // a phase after the cut never plays
    expect(e.play("craterize", {}, { id: "run", phase: "debris" })).toBeNull();
    // the page hidden: all of it stops, the context sleeps soon after
    (document as unknown as { hidden: boolean }).hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(e.ready).toBe(false);
    expect(e.play("tree")).toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.state).toBe("suspended");
    // back: the next gesture wakes it, and nothing from before plays
    (document as unknown as { hidden: boolean }).hidden = false;
    const started = ctx.started.length;
    await e.unlock();
    expect(ctx.started.length).toBe(started);
    // off is off
    e.setSettings({ enabled: false });
    expect(e.play("tree")).toBeNull();
    e.setSettings({ enabled: true });
    // a burst of accents: ten a second at most, six at once
    let admitted = 0;
    for (let k = 0; k < 40; k++) if (e.play(k % 2 ? "tree" : "berry")) admitted++;
    expect(admitted).toBeLessThanOrEqual(6);
    expect(e.playing).toBeLessThanOrEqual(LIMITS.sources);
    await e.dispose();
    expect(ctx.state).toBe("closed");
  });

  it("nothing on the editor's input path waits for audio: every call returns at once while the bank never finishes loading", () => {
    const ctx = new FakeContext();
    ctx.resumeGate = new Promise(() => undefined);
    const never = fakeFetch(() => new Promise(() => undefined));
    const engine = new JuiceEngine({}, never.fetcher, () => ctx as unknown as AudioContext);
    void engine.unlock();
    const j = new Juice(() => null, { on: true, volume: 0.72 }, engine);
    const cue = (phase: ForceCue["phase"]): ForceCue => ({ verb: "erupt", phase, progress: 0.5, x: 3, y: 3, z: 5, size: 20, power: 60 });
    const t0 = performance.now();
    const results = [
      j.play("raise", 1, 1, 3),
      j.play("place", 1, 1, 1, false, "Pine"),
      j.play("source", 2, 2, 1, false, "badwater"),
      j.strokeSound("lower", 1, 1, 4),
      j.strokeSound("lower", 2, 1, 4),
      j.strokeEnd(),
      j.undo(),
      j.forceMoment(cue("rumble")),
      j.forceMoment(cue("rise")),
      j.forceEnded(false),
      j.setSound({ on: true, volume: 0.5 }),
    ];
    expect(performance.now() - t0).toBeLessThan(50);
    for (const r of results) expect(r).toBeUndefined();
    expect(engine.ready).toBe(false);
    j.dispose();
  });
});
