// D448 correctness only: all eight #71 fixtures in native Rust and Node-Wasm, and the sink case (t7-sink:
// from the game's code, not yet played; tools/rust/stack-sink-fixture.ts).
// With --threads N, the app's canonical settle of each fixture's map (stackWater.ts `canonicalStackRun`) runs
// twice, on one thread and on N (the multi-core settle, src/core/sim/stackParallel.ts, on Node's
// worker_threads at every size), and must give the same bytes.
// Build first: cargo build --release -j 4 -p water --example stack-fixture (inside rust/).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stackFixtures, inputBytes, runStackFixture, fixtureOutput, settleFixture } from './stack-fixtures';
import { installNodeThreads, nodeThreadsReady, uninstallParallelWater } from './water-threads';
import { withoutParallelWater } from '../../src/core/sim/parallel';
import { canonicalStackRun, type StackSettle } from '../../src/core/sim/stackWater';
import { StackLive } from '../../src/core/sim/stackLive';
import type { WaterModel } from '../../src/core/sim/water';
import { stackParallelStats } from '../../src/core/sim/stackParallel';
const root = resolve(import.meta.dirname, '../..');
const dir = process.env.DGM_STACK_LOCAL ?? join(root, '.scratch/stacked-water');
mkdirSync(dir, { recursive: true });
const exe = join(root, 'rust/target/release/examples', process.platform === 'win32' ? 'stack-fixture.exe' : 'stack-fixture');
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const results = [];
for (const f of stackFixtures) {
    const input = inputBytes(f);
    if (hash(input) !== f.inputSha256)
        throw Error(f.name + ' input changed');
    const p = join(dir, f.name + '.input');
    writeFileSync(p, input);
    const native = execFileSync(exe, [p], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    const wasm = runStackFixture(f);
    const out = fixtureOutput(wasm);
    if (!native.equals(Buffer.from(out)))
        throw Error(f.name + ' native differs from Node-Wasm at byte ' + native.findIndex((b, i) => b !== out[i]));
    for (const [id, expected] of Object.entries(f.fields)) {
        if (hash(wasm.fields[Number(id)]) !== expected)
            throw Error(f.name + ' differs from #71 field ' + id);
    }
    for (const [id, key] of [[6, 'depth'], [7, 'overflow'], [8, 'contamination']] as const) {
        if (hash(wasm.fields[id]).slice(0, 16) !== f.hashes[key])
            throw Error(f.name + ' differs from golden ' + key);
    }
    if (f.settle && (wasm.info[0] !== f.settle.ticks || wasm.info[2] !== (f.settle.settled ? 1 : 2)))
        throw Error(f.name + ' settle differs');
    const row = { name: f.name, ticks: wasm.info[0], nativeSha256: hash(native), goldenWater: true, allFields: true };
    results.push(row);
    writeFileSync(join(dir, f.name + '.native'), native);
    console.log('PASS ' + f.name + ' native = Node-Wasm = ' + (f.name === 't7-sink' ? 'pinned (not yet played)' : '#71 golden') + '; ' + row.ticks + ' ticks');
}
// Changing slice boundaries must preserve the entire exposed state.
for (const name of ['cave-valley', 'lake-cave']) {
    const f = stackFixtures.find(f => f.name === name)!;
    const a = fixtureOutput(runStackFixture(f));
    const b = fixtureOutput(runStackFixture(f, 37));
    if (!Buffer.from(a).equals(Buffer.from(b)))
        throw Error(name + ' slices differ');
    console.log('PASS ' + name + ' slices of 37');
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify({ reference: '24b88b9b', cases: results, nativeEqualsNodeWasm: true, slices: true }, null, 2) + '\n');
const at = process.argv.indexOf('--threads');
const threads = at >= 0 ? Number(process.argv[at + 1]) : 0;
if (threads) {
    installNodeThreads(threads);
    await nodeThreadsReady(threads);
    // (the reach too, where the water went, and each column's outflows: the strips gather both from their own rows, D453's settle at once and the 3D view's moving water)
    const bytes = (s: StackSettle) => Buffer.concat([s.depth, s.overflow, s.contamination, s.sat, ...(s.reach ? [s.reach] : []), ...(s.flows ? [s.flows] : [])].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
    // and a map whose strips' edges cut every kind of emitter (3×3 bad sources, clean and bad seeps, aquifers,
    // drains): one every three rows from top to bottom, under a roof and in the open, so whatever rows the strips
    // take, some straddle an edge
    // with stored lakes (a Fill in a sealed pocket under the ground, one in the open cave) and a removal's drained
    // tiles: the settle's stop once only sealed basins change, the pocket stored as it began, and the settle on from
    // the water once the removal took its water (Fill and Remove unfed water on maps with caves); and the pocket's
    // lake stored on half of it, so its water runs over the rest and is stored levelled (stack_level.rs)
    const cut = (lakes = false, drain = false, moves = false): StackSettle => {
        const W = 48, H = 48;
        const mask = new Uint32Array(W * H);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const ground = 4 + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) - (x > 30 && x < 40 ? 2 : 0);
                mask[y * W + x] = (1 << ground) - 1;
                // a roof over the middle columns: a cave from level 7 to 9
                if (x >= 14 && x < 26) mask[y * W + x] |= 0b111 << 9;
                // a sealed pocket at levels 1–2 under the ground
                if (lakes && x >= 42 && x <= 45 && y >= 40 && y <= 44) mask[y * W + x] &= ~0b110;
            }
        const kinds = [8, 9, 10, 11, 6];
        const objects: number[] = [];
        for (let k = 0, y = 1; y < H - 2; y += 3, k++) {
            const kind = kinds[k % kinds.length];
            for (const x of [4 + (k % 3), 18 + (k % 4), 34]) {
                const i = y * W + x;
                const z = 32 - Math.clz32(mask[i] & 0x1ff);
                objects.push(kind, x, y, z, k % 4, k % 2, 0, kind === 6 ? 0 : 3);
            }
        }
        const tiles: number[] = [];
        for (let y = 40; y <= (moves ? 42 : 44); y++) for (let x = 42; x <= 45; x++) tiles.push(y * W + x);
        const cave: number[] = [];
        for (let y = 20; y <= 22; y++) for (let x = 15; x <= 17; x++) cave.push(y * W + x);
        const retained = lakes
            ? [
                { tiles, floor: tiles.map(() => 1), depth: tiles.map(() => 1.5), contamination: tiles.map(() => 0) },
                { tiles: cave, floor: cave.map((i) => 32 - Math.clz32(mask[i] & 0x1ff)), depth: cave.map(() => 0.5), contamination: cave.map(() => 0) },
            ]
            : [];
        const run = canonicalStackRun(W, H, { mask, objects: Float64Array.from(objects) }, retained, drain ? tiles : []);
        let s = run.advance(16);
        while (!s) s = run.advance(16);
        return s;
    };
    // and a basin filling over a one-voxel shelf: columns with two edges the same way that carry flow, whose
    // outflows must be summed and rounded alike on one thread and on several (#517's review)
    const shelf = (lip: number) => (): StackSettle => {
        const W = 48, H = 48;
        const mask = new Uint32Array(W * H);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
                const g = wall ? 14 : x < 16 ? 4 : 3;
                mask[y * W + x] = (1 << g) - 1;
                if (!wall && x >= 20 && x < 28) mask[y * W + x] |= 1 << lip;
            }
        const objects: number[] = [];
        for (let y = 4; y < H - 4; y += 4) objects.push(7, 2, y, 4, 0, 0, 0, 3);
        // water kept to level 8 west of the shelf only, so at its edge it still runs into the columns under and over it
        const tiles: number[] = [], floor: number[] = [], depth: number[] = [];
        for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < 20; x++) {
                const g = x < 16 ? 4 : 3;
                tiles.push(y * W + x);
                floor.push(g);
                depth.push(8 - g);
            }
        const run = canonicalStackRun(W, H, { mask, objects: Float64Array.from(objects) }, [{ tiles, floor, depth, contamination: tiles.map(() => 0) }]);
        let s = run.advance(1e6);
        while (!s) s = run.advance(1e6);
        return s;
    };
    const cases: { name: string; settle: () => StackSettle }[] = [...stackFixtures.map(f => ({ name: f.name, settle: () => settleFixture(f) })), { name: 'emitters cut by the strips', settle: () => cut() }, { name: 'stored lakes', settle: () => cut(true) }, { name: 'stored lakes and a removal', settle: () => cut(true, true) }, { name: 'a shelf at 5 under filling water', settle: shelf(5) }, { name: 'a shelf at 6 under filling water', settle: shelf(6) }, { name: 'a stored lake whose water moves', settle: () => cut(true, false, true) }];
    let ran = 0;
    for (const c of cases) {
        const one = withoutParallelWater(c.settle);
        const before = stackParallelStats.ticks;
        const many = c.settle();
        if (!bytes(one).equals(bytes(many)) || one.settled !== many.settled || one.ticks !== many.ticks || one.steadyTicks !== many.steadyTicks || !one.reach !== !many.reach || !one.flows !== !many.flows)
            throw Error(c.name + ' differs on ' + threads + ' threads');
        if (stackParallelStats.ticks > before) ran++;
        console.log('PASS ' + c.name + ' canonical settle on one thread = on ' + threads + (stackParallelStats.ticks > before ? '' : ' (one thread: an open field, or the settle after a removal)') + '; ' + many.ticks + ' ticks');
    }
    // the live water (stackLive.ts): the journey after an edit, on from water already flowing, its flows' momentum
    // taken into the strips and handed back at each check: on one thread and on several, the same water, momentum and
    // frames at every check, on a map with a cave and every kind of emitter, the water poured on across the strips' edges
    {
        const W = 48, H = 48;
        const mask = new Uint32Array(W * H);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const ground = 4 + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) - (x > 30 && x < 40 ? 2 : 0);
                mask[y * W + x] = ((1 << ground) - 1) | (x >= 14 && x < 26 ? 0b111 << 9 : 0);
            }
        const objects: number[] = [];
        const kinds = [8, 9, 10, 11, 6];
        for (let k = 0, y = 1; y < H - 2; y += 3, k++)
            for (const x of [4 + (k % 3), 18 + (k % 4), 34]) objects.push(kinds[k % kinds.length], x, y, 32 - Math.clz32(mask[y * W + x] & 0x1ff), k % 4, k % 2, 0, kinds[k % kinds.length] === 6 ? 0 : 3);
        const model = { W, H, stacked: { mask, objects: Float64Array.from(objects) } } as unknown as WaterModel;
        const settled = withoutParallelWater(() => {
            const run = canonicalStackRun(W, H, model.stacked!);
            let s = run.advance(1e6);
            while (!s) s = run.advance(1e6);
            return s;
        });
        const N = W * H;
        const depth = settled.depth.slice();
        for (let i = 0; i < N; i++) {
            const n = settled.count[i];
            const c = (n - 1) * N + i;
            if (n && i % W < 30 && settled.floor[c] + depth[c] + 1 <= settled.ceil[c]) depth[c] += 1;
        }
        const from = { ...settled, depth };
        const one = new StackLive(model, from, settled, 4, false);
        const many = new StackLive(model, from, settled, 4, true);
        const before = stackParallelStats.ticks;
        const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Buffer.from(Float64Array.from(a).buffer).equals(Buffer.from(Float64Array.from(b).buffer));
        let checks = 0;
        for (let last = -Infinity; ; ) {
            const d1 = one.advance(4);
            const d2 = many.advance(4);
            if (d1 !== d2 || one.ticks !== many.ticks) throw Error('the live water runs differently on ' + threads + ' threads at tick ' + one.ticks);
            if (one.ticks - last >= 12 || d1) {
                last = one.ticks;
                const fa = one.frame(), fb = many.frame();
                if (!same(fa.depth, fb.depth) || !same(fa.contamination, fb.contamination) || !same(fa.flows, fb.flows)) throw Error('a frame of the live water differs on ' + threads + ' threads at tick ' + one.ticks);
            }
            if (one.ticks % 128 === 0 || d1) {
                const a = one.state(), b = many.state();
                if (!same(a.depth, b.depth) || !same(a.overflow, b.overflow) || !same(a.contamination, b.contamination) || !same(a.edges!.out, b.edges!.out)) throw Error('the live water differs on ' + threads + ' threads at tick ' + one.ticks);
                checks++;
            }
            if (d1 || one.ticks >= 2048) break;
        }
        one.close();
        many.close();
        if (stackParallelStats.ticks === before) throw Error('the live water never ran on threads');
        console.log('PASS the live water on one thread = on ' + threads + ', its momentum handed over at ' + checks + ' checks; ' + one.ticks + ' ticks');
    }
    uninstallParallelWater();
    if (!ran) throw Error('the threads never ran');
}
