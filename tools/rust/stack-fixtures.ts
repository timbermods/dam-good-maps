// D448 fixed #71 fixtures, not a TypeScript simulation. Compressed inputs are test data;
// the engine receives only Rust-owned typed arrays, one call per operation.
import { gunzipSync } from 'fflate';
import data from '../../tests/golden/stacked-water.json' with { type: 'json' };
import { StackWater as StackMemory } from '../../src/core/sim/stackWater';
export const stackFixtures = data.cases;
export function inputBytes(f: typeof stackFixtures[number]) { return gunzipSync(Uint8Array.from(atob(f.inputGzip), c => c.charCodeAt(0))); }
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
