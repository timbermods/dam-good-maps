import {readFileSync,writeFileSync} from 'node:fs';
const dir=import.meta.dirname;
let patch=readFileSync(dir+'/kernel.patch','utf8');
function add(path,text){const lines=text.replaceAll('\r\n','\n').trimEnd().split('\n');patch+=`diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}
for(const file of ['kernel.ts','wall.ts','spill.ts','engine.ts','worker.ts','worker-client.ts'])add('src/core/damSketch/'+file,'// Dam sketch (D383), adopted from investigation/dam-sketch-3.\n'+readFileSync(dir+'/'+file,'utf8').replaceAll(/(from\s+['"]\.[^'"]*)\.ts(['"])/g,'$1$2'));
add('tests/fixtures/damSketch.ts',readFileSync(dir+'/scenes.ts','utf8').replace("from './wall.ts'","from '../../src/core/damSketch/wall'"));
let tests=readFileSync(dir+'/engine.test.ts','utf8').replace("import test from 'node:test';","import {test} from 'vitest';").replace("import {readFileSync} from 'node:fs';\n",'');
for(const file of ['kernel','engine','wall','worker-client'])tests=tests.replaceAll(`from './${file}.ts'`,`from '../../src/core/damSketch/${file}'`);
tests=tests.replace("from './scenes.ts'","from '../fixtures/damSketch'").replace("from '../../src/core/sim/waterWasm.ts'","from '../../src/core/sim/waterWasm'");
tests=tests.replace(/const bytes=readFileSync\([^\n]+\);/,"const bytes=Buffer.from(WATER_WASM,'base64');");
add('tests/unit/damSketch.test.ts',tests);
writeFileSync(dir+'/adoption.patch',patch);
console.log('Wrote adoption.patch: Rust object extension, headless core and correctness scenes.');
