// Check the dependency adapter against today's compressor, then trap its native log.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {deps,HERE,LOCAL,json} from './common.mjs';
const output=resolve(LOCAL,'compression-check.cjs');
await deps('esbuild').build({entryPoints:[resolve(HERE,'compression.ts')],outfile:output,bundle:true,platform:'node',format:'cjs',nodePaths:[resolve(deps.resolve('fflate/package.json'),'../..')]});
const adapter=createRequire(import.meta.url)(output),native=deps('fflate');
for(let n=0;n<=500000;n++)if(adapter.memoryFor(n)!==Math.ceil(Math.max(8,Math.min(13,Math.log(n)))*1.5)-12)throw Error('Memory decision differs at '+n);
const fixtures=[];
for(const n of [0,1,255,4096,16384,65536,262144,500000]){
  const data=Uint8Array.from({length:n},(_,i)=>(i*31+(i>>>8))&255);
  for(const level of [0,1,6,9]){
    const options={level,mtime:0};for(const kind of ['gzip','zlib'])fixtures.push({kind,data,options,expected:native[kind+'Sync'](data,options)});
  }
}
const tree={'one.bin':new Uint8Array(4096),'folder':{'two.bin':[new Uint8Array(65536),{level:1}]}},options={level:6,mtime:new Date(2000,0,1)};
fixtures.push({kind:'zip',data:tree,options,expected:native.zipSync(tree,options)});
const saved=Math.log;Math.log=()=>{throw Error('Native dependency log reached');};
try{for(const f of fixtures){const actual=adapter[f.kind+'Sync'](f.data,f.options);if(!Buffer.from(actual).equals(Buffer.from(f.expected)))throw Error(f.kind+' bytes changed');}}
finally{Math.log=saved;}
json('compression-summary.json',{memoryDecisions:500001,byteFixtures:fixtures.length,changed:0,nativeLogTrapped:true,fflate:deps('fflate/package.json').version});
console.log('500001 compressor decisions and 65 byte fixtures match; native log trapped');
