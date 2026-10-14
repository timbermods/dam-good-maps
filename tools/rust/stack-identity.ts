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
    const bytes = (s: StackSettle) => Buffer.concat([s.depth, s.overflow, s.contamination, s.sat].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
    // and a map whose strips' edges cut every kind of emitter (3×3 bad sources, clean and bad seeps, aquifers,
    // drains): one every three rows from top to bottom, under a roof and in the open, so whatever rows the strips
    // take, some straddle an edge
    const cut = (): StackSettle => {
        const W = 48, H = 48;
        const mask = new Uint32Array(W * H);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const ground = 4 + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) - (x > 30 && x < 40 ? 2 : 0);
                mask[y * W + x] = (1 << ground) - 1;
                // a roof over the middle columns: a cave from level 7 to 9
                if (x >= 14 && x < 26) mask[y * W + x] |= 0b111 << 9;
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
        const run = canonicalStackRun(W, H, { mask, objects: Float64Array.from(objects) });
        let s = run.advance(16);
        while (!s) s = run.advance(16);
        return s;
    };
    const cases: { name: string; settle: () => StackSettle }[] = [...stackFixtures.map(f => ({ name: f.name, settle: () => settleFixture(f) })), { name: 'emitters cut by the strips', settle: cut }];
    let ran = 0;
    for (const c of cases) {
        const one = withoutParallelWater(c.settle);
        const before = stackParallelStats.ticks;
        const many = c.settle();
        if (!bytes(one).equals(bytes(many)) || one.settled !== many.settled || one.ticks !== many.ticks)
            throw Error(c.name + ' differs on ' + threads + ' threads');
        if (stackParallelStats.ticks > before) ran++;
        console.log('PASS ' + c.name + ' canonical settle on one thread = on ' + threads + (stackParallelStats.ticks > before ? '' : ' (one thread: an open field)') + '; ' + many.ticks + ' ticks');
    }
    uninstallParallelWater();
    if (!ran) throw Error('the threads never ran');
}
