// D448 core/ABI contracts: #71's immutable water fixtures and plain refusals.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { stackFixtures, runStackFixture, fixtureOutput } from '../../tools/rust/stack-fixtures';
import { StackWater as StackMemory } from '../../src/core/sim/stackWater';
import { prefill, canonicalSettle } from '../../src/core/sim/prefill';
import type { WaterModel } from '../../src/core/sim/water';
const hash = (a: Uint8Array) => createHash('sha256').update(a).digest('hex');
describe('Rust stacked water', () => {
    it('the typed flat path preserves current prefill and canonical bytes, stored and drained water included', () => {
        const W = 12, H = 10, N = W * H;
        const floor = new Float64Array(N).fill(5);
        for (let y = 2; y < 8; y++)
            for (let x = 2; x < 10; x++)
                floor[y * W + x] = 2;
        const model: WaterModel = { W, H, floor, dam: null, emitters: [{ cells: [3 * W + 3], strength: 1, contamination: 0 }], retained: [{ tiles: [5 * W + 7], floor: [2], depth: [1.5], contamination: [0.4] }], drained: [5 * W + 8] };
        const m = new StackMemory(W, H, 1, 1);
        try {
            (m.view(0) as Uint32Array).set(Array.from(floor, h => 2 ** h - 1));
            (m.view(1) as Float64Array).set([7, 3, 3, 2, 0, 0, 0, 1]);
            (m.view(2) as Float64Array).set([5 * W + 7, 2, 1.5, 0.4]);
            (m.view(20) as Uint8Array)[5 * W + 8] = 1;
            m.op(0);
            expect(m.info(1)).toBe(0);
            m.op(2);
            const start = prefill(model);
            expect(m.view(6)).toEqual(start.depth);
            expect(m.view(8)).toEqual(start.contamination);
            const today = canonicalSettle(model);
            m.op(3, 6);
            while (!m.info(2))
                m.op(4, 37);
            m.op(6);
            expect(m.info(0)).toBe(today.ticks);
            expect(m.info(2)).toBe(today.settled ? 1 : 2);
            expect(m.view(6)).toEqual(today.depth);
            expect(m.view(8)).toEqual(today.contamination);
            expect(m.view(10)).toEqual(today.out);
            expect(m.view(16)).toEqual(today.sat);
        }
        finally {
            m.close();
        }
    });
    it('matches every #71 golden water byte and graph', () => {
        for (const f of stackFixtures) {
            const r = runStackFixture(f);
            for (const [id, expected] of Object.entries(f.fields))
                expect(hash(r.fields[Number(id)]), f.name + ' field ' + id).toBe(expected);
            for (const [id, key] of [[6, 'depth'], [7, 'overflow'], [8, 'contamination']] as const)
                expect(hash(r.fields[id]).slice(0, 16), f.name + ' ' + key).toBe(f.hashes[key]);
            if (f.settle) {
                expect(r.info[0]).toBe(f.settle.ticks);
                expect(r.info[2]).toBe(f.settle.settled ? 1 : 2);
            }
        }
    });
    it('keeps all exposed state identical through different slices', () => {
        for (const name of ['cave-valley', 'lake-cave']) {
            const f = stackFixtures.find(f => f.name === name)!;
            expect(Buffer.from(fixtureOutput(runStackFixture(f, 37)))).toEqual(Buffer.from(fixtureOutput(runStackFixture(f))));
        }
    });
    it('refuses malformed input without a Wasm trap or a multiline message', () => {
        expect(() => new StackMemory(0, 2)).toThrow(/^Water map dimensions are invalid\.$/);
        const m = new StackMemory(3, 3, 1);
        try {
            expect(() => m.view(6)).toThrow(/^Water map handle or field is invalid\.$/);
            (m.view(1) as Float64Array)[0] = 999;
            expect(() => m.op(0)).toThrow(/^Water object is unknown or malformed\.$/);
            (m.view(1) as Float64Array)[0] = 7;
            m.op(0);
            expect(() => m.op(999)).toThrow(/^Water operation is unknown\.$/);
            expect(() => m.op(1, NaN, 1)).toThrow(/^Water run arguments are invalid\.$/);
            (m.view(15) as Float64Array)[0] = NaN;
            expect(() => m.op(5)).toThrow(/^Water emitter parameters are malformed\.$/);
            (m.view(15) as Float64Array)[0] = 1;
            m.op(3, 6);
            (m.view(15) as Float64Array)[0] = NaN;
            expect(() => m.op(4, 37)).toThrow(/^Water emitter parameters are malformed\.$/);
            (m.view(15) as Float64Array)[0] = 1;
            m.op(0);
            (m.view(6) as Float64Array)[0] = NaN;
            expect(() => m.op(1, 1, 1)).toThrow(/^Water state is malformed\.$/);
        }
        finally {
            m.close();
        }
        expect(() => m.op(1, 1, 1)).toThrow(/^Water operation is unknown\.$/);
    });
});
