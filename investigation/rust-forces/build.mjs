import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {HERE,ROOT,LOCAL,deps,hash,json} from './common.mjs';
const base='4aab909e23016902cbbe6ffaeddeece786176ab3';
const nodePaths=[resolve(dirname(deps.resolve('esbuild/package.json')),'..')];
const meta={base,inputs:{}};
const esbuildPackage=process.platform==='win32'?'@esbuild/win32-'+process.arch:'@esbuild/'+process.platform+'-'+process.arch;
const executable=resolve(dirname(deps.resolve(esbuildPackage+'/package.json')),process.platform==='win32'?'esbuild.exe':'bin/esbuild');
const oracleEntry=readFileSync(resolve(HERE,'api.ts'),'utf8').replaceAll('./local/checkout/',ROOT.replaceAll('\\','/')+'/').replace("from './protocol'","from '../protocol'");
writeFileSync(resolve(LOCAL,'oracle-api.ts'),oracleEntry);
writeFileSync(resolve(LOCAL,'oracle-worker.ts'),readFileSync(resolve(HERE,'worker.ts'),'utf8').replace("from './api'","from './oracle-api'"));
for(const [entry,platform,outfile] of [['oracle-api.ts','node','api.cjs'],['oracle-api.ts','browser','api.js'],['oracle-worker.ts','browser','worker.js']]){
 console.log('Bundling',outfile);
 const metafile=resolve(LOCAL,outfile+'.meta.json');
 execFileSync(executable,[resolve(LOCAL,entry),'--bundle','--platform='+platform,'--format='+(platform==='node'?'cjs':'esm'),'--target=es2022','--outfile='+resolve(LOCAL,outfile),'--metafile='+metafile],{env:{...process.env,NODE_PATH:nodePaths.join(process.platform==='win32'?';':':')},stdio:'inherit',timeout:120000,windowsHide:true});
 for(const p of Object.keys(JSON.parse(readFileSync(metafile,'utf8')).inputs))meta.inputs[p]=hash(readFileSync(p));
}
const wasm=readFileSync(resolve(LOCAL,'target/wasm32-unknown-unknown/release/rust_forces.wasm'));writeFileSync(resolve(LOCAL,'forces.wasm'),wasm);meta.wasm={sha256:hash(wasm),bytes:wasm.length,gzip:gzipSync(wasm,{level:9}).length,brotli:brotliCompressSync(wasm).length};json('build.json',meta);console.log(meta.wasm);
