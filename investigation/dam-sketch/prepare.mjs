// All generated source, dependencies, maps, bundles and binaries stay in local/.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const local = resolve(here, 'local'); mkdirSync(local, { recursive: true });
const require = createRequire(resolve(process.env.DGM_DEPS ?? local, 'package.json'));
const esbuild = require('esbuild');
export const RUST_PIN = '2ebeea87c55d5f728c735d79a6d24bde78999db7';
const gitFile = path => execFileSync('git', ['show', RUST_PIN + ':' + path], { cwd: root });
for (const name of ['water.ts', 'protocol.ts']) {
  let text = gitFile('investigation/rust-water/' + name).toString();
  text = text.replaceAll('./local/reference-water', './reference-water');
  writeFileSync(resolve(local, name), text);
}
writeFileSync(resolve(local, 'reference-water.ts'),
  execFileSync('git', ['show', 'e292cefe:src/core/sim/water.ts'], { cwd: root }));
writeFileSync(resolve(local, 'runtime.ts'), "export * from './water';\n");
// Reuse a pinned, already compiled artifact, or compile the pinned crate in this folder.
const wasm = resolve(local, 'water.wasm');
if (process.env.DGM_RUST_WASM) copyFileSync(process.env.DGM_RUST_WASM, wasm);
if (!existsSync(wasm)) {
  for (const name of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'src/lib.rs', 'rust/main.rs']) {
    const target = resolve(local, 'crate', name); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, gitFile('investigation/rust-water/' + name));
  }
  execFileSync(process.env.DGM_CARGO ?? 'cargo', ['build', '--release', '--lib',
    '--target', 'wasm32-unknown-unknown', '--target-dir', resolve(local, 'target')],
    { cwd: resolve(local, 'crate'), stdio: 'inherit' });
  copyFileSync(resolve(local, 'target/wasm32-unknown-unknown/release/rust_water.wasm'), wasm);
}
const nodePaths = [resolve(local, 'node_modules'), resolve(process.env.DGM_DEPS ?? local, 'node_modules')];
const inputs = {};
for (const entry of ['check', 'demo', 'live']) {
  const result = await esbuild.build({ entryPoints: [resolve(here, entry + '.ts')],
    outfile: resolve(local, entry + '.cjs'), bundle: true, platform: 'node',
    format: 'cjs', target: 'es2022', nodePaths, metafile: true });
  for (const path of Object.keys(result.metafile.inputs)) {
    inputs[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
const bytes = readFileSync(wasm);
writeFileSync(resolve(local, 'provenance.json'), JSON.stringify({
  dev: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  rust: RUST_PIN, wasmSha256: createHash('sha256').update(bytes).digest('hex'), inputs
}, null, 2));
console.log('Prepared pinned game-rules Rust/TS runtime and investigation bundles.');
