import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,deps,json,hash} from './common.mjs';
const source=readFileSync(resolve(ROOT,'src/core/sim/water.ts'),'utf8');writeFileSync(resolve(LOCAL,'reference-water.ts'),source);
const protocol=execFileSync('git',['show','d18a6f4d:investigation/rust-water/protocol.ts'],{cwd:ROOT,encoding:'utf8'}).replaceAll('./local/reference-water','./reference-water');writeFileSync(resolve(LOCAL,'protocol.ts'),protocol);
const names=['distanceFrom','levelRegions','walkDistance','walkRegions','landRegions','components','spillLevels','damSites','roomMap'];const ts=deps('typescript'),inputs={};
await deps('esbuild').build({entryPoints:[resolve(HERE,'api.ts')],outfile:resolve(LOCAL,'native-api.cjs'),bundle:true,format:'cjs',platform:'node',target:'es2022',nodePaths:[resolve(dirname(deps.resolve('esbuild/package.json')),'..')],plugins:[{name:'native-kernels-and-water',setup(b){
 b.onResolve({filter:/water$/},a=>resolve(a.resolveDir,a.path)===resolve(ROOT,'src/core/sim/water')?{path:resolve(HERE,'native-water.ts')}:undefined);
 b.onLoad({filter:/[\\/]src[\\/]core[\\/].*\.ts$/},a=>{let source=readFileSync(a.path,'utf8');inputs[relative(ROOT,a.path)]=hash(source.replaceAll('\r\n','\n'));const ast=ts.createSourceFile(a.path,source,ts.ScriptTarget.Latest,true),edits=[];for(const n of ast.statements)if(ts.isFunctionDeclaration(n)&&n.body&&names.includes(n.name?.text))edits.push([n.body.getStart(ast)+1,`const __r=globalThis.__ra?.replace(${JSON.stringify(n.name.text)},Array.from(arguments));if(__r!==undefined)return __r;`]);for(const[at,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,at)+text+source.slice(at);return {contents:source,loader:'ts',resolveDir:dirname(a.path)};});
}}]});
writeFileSync(resolve(LOCAL,'m9b-native.ts'),readFileSync(resolve(LOCAL,'m9b.ts'),'utf8').replaceAll('./api.cjs','./native-api.cjs'));
await deps('esbuild').build({entryPoints:[resolve(LOCAL,'m9b-native.ts')],outfile:resolve(LOCAL,'m9b-native.cjs'),bundle:true,platform:'node',format:'cjs',external:['./native-api.cjs',resolve(ROOT,'investigation/probe/runner/model')]});
await deps('esbuild').build({entryPoints:[resolve(HERE,'bridge.ts')],outfile:resolve(LOCAL,'native-bridge.cjs'),bundle:true,platform:'node',format:'cjs'});
json('native-build.json',{waterCommit:'d18a6f4d890d3f2e3f7b480e308242375c100e10',inputs,addon:hash(readFileSync(resolve(LOCAL,'analysis.node')))});
await deps('esbuild').build({stdin:{contents:`export {roomMap} from ${JSON.stringify(resolve(ROOT,'src/core/land/minePads.ts'))}`,resolveDir:ROOT,loader:'ts'},outfile:resolve(LOCAL,'room-reference.cjs'),bundle:true,platform:'node',format:'cjs'});
console.log('Native analysis + resident native Rust water built');
await deps('esbuild').build({entryPoints:[resolve(HERE,'native-water.ts'),resolve(LOCAL,'reference-water.ts')],outdir:resolve(LOCAL,'water-contract-build'),outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',target:'es2022'});
deps('esbuild').stop();
