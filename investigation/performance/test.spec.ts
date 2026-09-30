import { describe, it, expect, vi } from 'vitest';
import { WaterPlayer, blendWater } from '../../src/editor/waterPlayer';
import { MapRenderer } from '../../src/render3d/renderer';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import { Juice, type SoundEngine } from '../../src/editor/juice';
import type { WaterView } from '../../src/render3d/model';
import { ForceDriver, type ForceHost } from '../../src/editor/forceDriver';
import type { ForceStarted } from '../../src/worker/session';

function water(depth: number): WaterView {
  return { count: 2, tile: Int32Array.of(3, 4), floor: Float32Array.of(2, 2), depth: Float32Array.of(depth, depth / 2), contamination: Float32Array.of(0, 1) };
}
describe('presentation proposal invariants', () => {
  it('refreshes a fall across the chunk boundary when ground two tiles from its lip changes', () => {
    const r = Object.create(MapRenderer.prototype) as any;
    const W = 64, H = 32, heights = new Uint8Array(W * H).fill(10);
    r.map = { W, H, heights, source: { W, H, heights, columns: new Map() }, sky: new Uint8Array(W * H),
      surface: { lower: [] }, water: { count: 0 } };
    r.map.water = { ...water(1), count: 2 };
    r.meshTerrain = vi.fn(); r.meshWater = vi.fn(); r.requestRender = vi.fn();
    r.updateTerrainRect(heights, { x0: 30, y0: 15, x1: 30, y1: 15 });
    expect(r.meshWater.mock.calls.map((c: any[]) => [c[0], c[1]])).toEqual([[0, 0], [1, 0]]);
  });
  it('does not retain cancelled gesture ids after their ordered worker drops complete', async () => {
    let resolveStart: (value: ForceStarted) => void = () => {};
    const host: ForceHost = {
      start: () => new Promise(resolve => { resolveStart = resolve; }), advance: async () => null,
      keep: async () => {}, drop: async () => {}, renderer: () => null,
      show() {}, changed() {}, error() {}, moment() {}, ended() {},
    };
    const driver = new ForceDriver(host);
    for (let k = 0; k < 500; k++) {
      const pending = driver.start(); driver.cancel();
      resolveStart({ ok: false, errors: [], frame: null, settings: null });
      expect(await pending).toBe(false);
    }
    expect((driver as any).dropped.size).toBe(0);
    expect(driver.running).toBe(false);
  });
  it('skip finalization allocates no intermediate blends; exact final water and callback survive replay', () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const first = water(1), final = water(3), seen: WaterView[] = [];
    const callback = vi.fn();
    const player = new WaterPlayer({ show: f => seen.push(f.water), changed() {} });
    player.pause(true); player.begin({ water: first, done: 0 });
    player.push({ water: final, done: 1, final: callback });
    const frames = (player as any).frames;
    const getter = Object.getOwnPropertyDescriptor(frames[1], 'water')?.get;
    expect(getter).toBeTypeOf('function');
    player.skip();
    expect(seen.at(-1)).toBe(final); expect(callback).toHaveBeenCalledTimes(1);
    player.replay(); player.pause(true);
    expect(seen.at(-1)).toBe(first);
    player.skip(); expect(seen.at(-1)).toBe(final); expect(callback).toHaveBeenCalledTimes(2);
    player.clear(); vi.unstubAllGlobals();
  });
  it('lazy blends equal the original eager blend bytes and cache only accessed frames', () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const a = water(1), b = water(3);
    const player = new WaterPlayer({ show() {}, changed() {} });
    player.pause(true); player.begin({ water: a, done: 0 }); player.push({ water: b, done: 1, final() {} });
    for (let k = 1; k <= 16; k++) {
      const frame = (player as any).frames[k];
      const wanted = blendWater(a, b, k / 17);
      expect(frame.water).toEqual(wanted); expect(frame.water).toBe(frame.water);
    }
    player.clear(); vi.unstubAllGlobals();
  });
  it('reuses matching GPU geometry with exact buffers and disposes a changed topology once', () => {
    const r = Object.create(MapRenderer.prototype) as any;
    const attrs = () => ({ position: new BufferAttribute(Float32Array.of(0, 1, 2, 3, 4, 5), 3), normal: new BufferAttribute(Int8Array.of(0, 127, 0, 0, 127, 0), 3, true) });
    const index = () => new BufferAttribute(Uint32Array.of(0, 1, 0), 1);
    const g: BufferGeometry = r.meshGeometry(undefined, attrs(), index());
    const mesh = new Mesh(g, new MeshBasicMaterial());
    const dispose = vi.spyOn(g, 'dispose'), next = attrs(); next.position.array[1] = 9;
    expect(r.meshGeometry(mesh, next, index())).toBe(g);
    expect(g.attributes.position.array).toEqual(next.position.array); expect(g.index!.array).toEqual(index().array);
    expect(dispose).not.toHaveBeenCalled();
    const changed = { ...attrs(), position: new BufferAttribute(new Float32Array(12), 3) };
    const g2 = r.meshGeometry(mesh, changed, index());
    expect(g2).not.toBe(g); expect(dispose).toHaveBeenCalledTimes(1);
    g2.dispose(); mesh.material.dispose();
  });
  it('releases the held force texture on the final motion cue before keep finishes', () => {
    const stop = vi.fn();
    const engine: SoundEngine = { unlock: async () => true, play: () => 1, start: (_n, _p, id) => id ?? 1, update() {}, stop, stopAll() {}, setSettings() {}, pause() {}, dispose() {} };
    const juice = new Juice(() => null, { on: true, volume: 0.5 }, engine);
    const cue = { verb: 'carve' as const, phase: 'carve' as const, progress: 0.5, x: 3, y: 3, z: 2, size: 8, power: 100 };
    juice.forceMoment(cue); expect(stop).not.toHaveBeenCalled();
    juice.forceMoment({ ...cue, phase: 'done' }); expect(stop).toHaveBeenCalledOnce();
    juice.forceEnded(true); expect(stop).toHaveBeenCalledOnce(); juice.dispose();
  });
});
