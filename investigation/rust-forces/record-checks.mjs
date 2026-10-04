// Commit compact evidence only; complete logs, fixtures and binaries stay ignored.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const read=name=>JSON.parse(readFileSync(resolve(LOCAL,name),'utf8'));
const log=name=>readFileSync(resolve(LOCAL,name),'utf8');
const build=read('build.json'),math=read('ir.json'),suite=read('existing-final.json'),browser=read('e2e.json'),core=read('core-host.json'),fixed=read('checks-adoption-final.json'),engines=read('browser-adoption-final.json');
const quick=log('ci-quick.log').match(/^\s*Tests\s+(.+)\((\d+)\)\s*$/m);
const quickCount=label=>Number(quick?.[1].match(new RegExp('(?:^|\\|)\\s*(\\d+) '+label))?.[1]??0);
const checks={
 ciRustBuild:{status:log('ci-rust-build.log').includes('matches a fresh build')?'pass':'fail',command:'npx tsx tools/rust/build.ts --check --native'},
 ciRustEngines:{status:log('ci-rust-check.log').includes('Rust check passed')?'pass':'fail',command:'npx tsx tools/rust/check.ts --engines',mathVectors:47063,waterFixtures:19,targets:['native','node-wasm','chromium','firefox','webkit']},
 ciEngineSmoke:{status:/183 cases.*0 mismatches, 0 errors/.test(log('ci-engines.log'))?'pass':'fail',command:'npx tsx tools/determinism/run.ts --smoke',cases:183,checkpointsPerTarget:610},
 ciQuickSuite:{status:quick?(quickCount('failed')?'fail':'pass'):'unknown',command:'npm run test:quick -- --maxWorkers 4',passed:quickCount('passed'),failed:quickCount('failed'),expectedFailures:quickCount('expected fail'),skipped:quickCount('skipped')},
 typecheck:{status:!log('ci-typecheck.log').includes('error TS')?'pass':'fail',command:'npm run typecheck'},
 build:{status:log('ci-build.log').includes('built in')?'pass':'fail',command:'npm run build'},
 portableArithmetic:{status:math.status,command:'node verify-ir.mjs',portableSha256:math.portableSha256,guardSha256:math.guardSha256},
 coreHostAdapter:{status:core.status,command:'node core-host-check.mjs',cases:core.rows.length},
 forceSuitesAgainstRust:{status:suite.success?'pass':'fail',command:'node existing-tests.mjs --bail 0',passed:suite.numPassedTests,failed:suite.numFailedTests,files:suite.testResults.length},
 forceBrowserSuites:{status:browser.stats.unexpected===0?'pass':'fail',command:'node existing-browser.mjs --workers 3 --max-failures 1',passed:browser.stats.expected,failed:browser.stats.unexpected,skipped:browser.stats.skipped},
 forceNativeWasmFixtures:{status:fixed.length===12&&fixed.every(r=>r.nativeChecked&&r.nodeWasmChecked&&r.typedRecordsChecked&&(r.verb==='footprint'||r.productWriterChecked))&&engines.rows.length===36&&engines.rows.every(r=>r.ok&&r.typedRecordsChecked&&(r.id.startsWith('footprint/')||r.productWriterChecked))?'pass':'fail',commands:['node check.mjs --verbs footprint,craterize,erupt,quake,carve,glaciate --sizes 128 --count 2 --name adoption-final --exports --server','node browser.mjs --verbs footprint,craterize,erupt,quake,carve,glaciate --sizes 128 --count 2 --name adoption-final --exports'],native:12,nodeWasm:12,browserPerEngine:12,exports:true}
};
const baselineFailures=suite.testResults.flatMap(file=>file.assertionResults.filter(test=>test.status==='failed').map(test=>({file:file.name.split('checkout/').at(-1).replaceAll('\\','/'),test:test.fullName,message:test.failureMessages.join('\n')})));
const evidence={oracle:build.base,scope:'D453/D454: local CI byte checks and existing force suites; no corpus, pilot, matrix, projection, timing or window.',wasmSha256:hash(readFileSync(resolve(LOCAL,'forces.wasm'))),nativeSha256:hash(readFileSync(resolve(LOCAL,'target/release/forces-batch.exe'))),rustSourceSha256:math.rustSourceSha256,checks,baselineFailures:baselineFailures.map(v=>({...v,message:v.message.slice(0,700)})),artifactDirectory:'local/adoption/'};
writeFileSync(resolve(HERE,'adoption-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const status=JSON.parse(readFileSync(resolve(HERE,'STATUS.json'),'utf8'));status.gates=Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.status==='pass']));const missing=Object.entries(checks).filter(([,v])=>v.status!=='pass').map(([k])=>k);status.adoption=missing.length?'blocked: '+missing.join(', '):'ready for adoption';writeFileSync(resolve(HERE,'STATUS.json'),JSON.stringify(status,null,2)+'\n');console.log(checks);
