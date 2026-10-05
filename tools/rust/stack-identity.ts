// D448 correctness only: all eight #71 fixtures in native Rust and Node-Wasm.
// Build first: cargo build --release -j 4 -p water --example stack-fixture (inside rust/).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stackFixtures, inputBytes, runStackFixture, fixtureOutput } from './stack-fixtures';
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
    console.log('PASS ' + f.name + ' native = Node-Wasm = #71 golden; ' + row.ticks + ' ticks');
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
