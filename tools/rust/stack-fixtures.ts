// D448 fixed #71 fixtures, not a TypeScript simulation. Compressed inputs are test data;
// the engine receives only Rust-owned typed arrays, one call per operation.
import { gunzipSync } from 'fflate';
import data from '../../tests/golden/stacked-water.json' with { type: 'json' };
import { canonicalStackRun, StackWater as StackMemory, type StackSettle } from '../../src/core/sim/stackWater';
import type { RetainedWater } from '../../src/core/sim/water';
export const stackFixtures = data.cases;
export function inputBytes(f: typeof stackFixtures[number]) { return gunzipSync(Uint8Array.from(atob(f.inputGzip), c => c.charCodeAt(0))); }
/** A fixture's map, for the app's canonical settle (stackWater.ts `canonicalStackRun`): its terrain's masks,
 *  its objects' rows and its retained water. */
export function fixtureMap(f: typeof stackFixtures[number]): { w: number; h: number; mask: Uint32Array; objects: Float64Array; retained: RetainedWater[] } {
    const b = inputBytes(f);
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const [w, h, o, r] = [0, 4, 8, 12].map(i => d.getUint32(i, true));
    const mask = new Uint32Array(w * h);
    let p = 20;
    for (let i = 0; i < w * h; i++, p += 4) mask[i] = d.getUint32(p, true);
    const objects = new Float64Array(8 * o);
    for (let i = 0; i < objects.length; i++, p += 8) objects[i] = d.getFloat64(p, true);
    const kept = { tiles: [] as number[], floor: [] as number[], depth: [] as number[], contamination: [] as number[] };
    for (let i = 0; i < r; i++, p += 32) {
        kept.tiles.push(d.getFloat64(p, true));
        kept.floor.push(d.getFloat64(p + 8, true));
        kept.depth.push(d.getFloat64(p + 16, true));
        kept.contamination.push(d.getFloat64(p + 24, true));
    }
    return { w, h, mask, objects, retained: r ? [kept] : [] };
}
/** The app's canonical settle of a fixture's map, in the worker's slices of 16 ticks: on several threads
 *  where this thread has a pool (src/core/sim/stackParallel.ts). */
export function settleFixture(f: typeof stackFixtures[number]): StackSettle {
    const { w, h, mask, objects, retained } = fixtureMap(f);
    const run = canonicalStackRun(w, h, { mask, objects }, retained);
    let s = run.advance(16);
    while (!s) s = run.advance(16);
    return s;
}
export function runStackFixture(f: typeof stackFixtures[number], slice = 10000000) {
    const bytes = inputBytes(f);
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 20;
    const [w, h, o, r, ops] = [0, 4, 8, 12, 16].map(i => d.getUint32(i, true));
    const m = new StackMemory(w, h, o, r);
    try {
        const masks = m.view(0) as Uint32Array;
        for (let i = 0; i < w * h; i++, at += 4)
            masks[i] = d.getUint32(at, true);
        for (const field of [1, 2]) {
            const view = m.view(field) as Float64Array;
            for (let i = 0; i < view.length; i++, at += 8)
                view[i] = d.getFloat64(at, true);
        }
        for (let i = 0; i < ops; i++) {
            const op = d.getFloat64(at, true), a = d.getFloat64(at + 8, true), b = d.getFloat64(at + 16, true);
            at += 24;
            if (op === 4 && slice < a) {
                while (!m.info(2))
                    m.op(4, slice);
            }
            else
                m.op(op, a, b);
        }
        if (at !== bytes.length)
            throw Error('Water fixture has trailing data.');
        const fields = Array.from({ length: 20 }, (_, i) => { const v = m.view(i); return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice(); });
        return { info: [0, 1, 2, 3, 4].map(q => m.info(q)), fields };
    }
    finally {
        m.close();
    }
}
export function fixtureOutput(result: ReturnType<typeof runStackFixture>) {
    const size = 40 + result.fields.reduce((n, b) => n + 4 + b.length, 0);
    const out = new Uint8Array(size);
    const d = new DataView(out.buffer);
    let at = 0;
    for (const v of result.info) {
        d.setFloat64(at, v, true);
        at += 8;
    }
    const widths = [4, 8, 8, 1, 2, 2, 8, 8, 8, 8, 8, 4, 4, 1, 4, 8, 1, 1, 2, 2];
    for (const [i, b] of result.fields.entries()) {
        d.setUint32(at, b.length / widths[i], true);
        at += 4;
        out.set(b, at);
        at += b.length;
    }
    return out;
}
