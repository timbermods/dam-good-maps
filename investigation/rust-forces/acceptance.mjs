// D453/D454: only CI byte checks and existing suites. No corpus/count/window gate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const status=JSON.parse(readFileSync(resolve(HERE,'STATUS.json')));
const evidence=JSON.parse(readFileSync(resolve(HERE,'adoption-evidence.json')));
const build=JSON.parse(readFileSync(resolve(LOCAL,'build.json')));
assert.equal(status.baseline,build.base);
assert.equal(evidence.oracle,status.baseline);
assert.equal(evidence.wasmSha256,hash(readFileSync(resolve(LOCAL,'forces.wasm'))));
assert.equal(evidence.nativeSha256,hash(readFileSync(resolve(LOCAL,'target/release/forces-batch.exe'))));
const math=JSON.parse(readFileSync(resolve(LOCAL,'ir.json')));
const {portableSha256,guardSha256}=await import('./shared-math.mjs');
assert.equal(math.portableSha256,portableSha256);assert.equal(math.guardSha256,guardSha256);
assert.equal(math.rustSourceSha256,hash(readFileSync(resolve(HERE,'src/lib.rs'))));
assert.equal(math.configSha256,hash(readFileSync(resolve(HERE,'.cargo/config.toml'))));
assert.equal(math.wasmSha256,evidence.wasmSha256);
const required=['ciRustBuild','ciRustEngines','ciEngineSmoke','ciQuickSuite','typecheck','build','portableArithmetic','coreHostAdapter','forceSuitesAgainstRust','forceBrowserSuites','forceNativeWasmFixtures'];
const missing=required.filter(key=>status.gates[key]!==true||evidence.checks[key]?.status!=='pass');
if(missing.length){console.error('NOT READY FOR ADOPTION: '+missing.join(', '));process.exitCode=1;}
else console.log('READY FOR ADOPTION: local CI byte checks and existing force suites pass. Full CI runs during adoption on dev.');
