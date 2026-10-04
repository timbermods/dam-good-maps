import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {HERE,ROOT,LOCAL,deps,json,hash} from './common.mjs';
const source=readFileSync(resolve(ROOT,'src/core/sim/water.ts'),'utf8');
const base=execFileSync('git',['rev-parse','e292cefe'],{encoding:'utf8'}).trim();
const pinned=execFileSync('git',['show',`${base}:src/core/sim/water.ts`]);
if(hash(pinned)!==hash(Buffer.from(source.replaceAll('\r\n','\n'))))throw Error('Reference water differs from e292cefe');
writeFileSync(resolve(LOCAL,'reference-water.ts'),source);
const nodePaths=[resolve(dirname(deps.resolve('esbuild/package.json')),'..')];
const meta={base,reference:hash(pinned),inputs:{}};
for(const variant of ['fast','rust','old'])for(const platform of ['node','browser']){
  const plugins=[{name:'water-variant',setup(b){b.onResolve({filter:/water$/},a=>{
    if(resolve(a.resolveDir,a.path)===resolve(ROOT,'src/core/sim/water'))return {path:variant==='rust'?resolve(HERE,'water.ts'):variant==='old'?resolve(LOCAL,'old-water.ts'):resolve(LOCAL,'reference-water.ts')};
  });}}];
  if(variant==='old') {let old=execFileSync('git',['show','b01f113c:src/core/sim/water.ts'],{encoding:'utf8'});old=old.replace('export const TICKS_PER_DAY = 768;','export const TICKS_PER_DAY = 768;\nexport const SETTLE_DAYS = 6;').replace('opts.maxDays ?? 4','opts.maxDays ?? SETTLE_DAYS');writeFileSync(resolve(LOCAL,'old-water.ts'),old);}
  const r=await deps('esbuild').build({entryPoints:[resolve(HERE,'api.ts')],outfile:resolve(LOCAL,variant+(platform==='node'?'.cjs':'.js')),bundle:true,format:platform==='node'?'cjs':'esm',platform,target:'es2022',nodePaths,plugins,metafile:true});
  for(const p of Object.keys(r.metafile.inputs))meta.inputs[p]=hash(readFileSync(p));
}
await deps('esbuild').build({entryPoints:[resolve(HERE,'protocol.ts')],outfile:resolve(LOCAL,'protocol.cjs'),bundle:true,platform:'node',format:'cjs'});
if(process.argv.includes('--wasm')){const wasm=readFileSync(resolve(LOCAL,'target/wasm32-unknown-unknown/release/rust_water.wasm'));writeFileSync(resolve(LOCAL,'water.wasm'),wasm);meta.wasm={sha256:hash(wasm),bytes:wasm.length,gzip:gzipSync(wasm,{level:9}).length,brotli:brotliCompressSync(wasm).length};}
json('build.json',meta);console.log('Built pinned TS, old TS (cap=6), Rust adapters',meta.wasm??'');
