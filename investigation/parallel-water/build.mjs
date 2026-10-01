import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {deps,HERE,ROOT,LOCAL,json,hash} from './common.mjs';
const esbuild=deps('esbuild');
const nodePaths=[resolve(dirname(deps.resolve('fflate/package.json')),'..')];
const manifest={inputs:{},esbuild:esbuild.version};
for (const [entry,platform] of [['api.ts','node'],['coordinator.ts','browser'],['helper.ts','browser']]) {
  const result=await esbuild.build({entryPoints:[resolve(HERE,entry)],outfile:resolve(LOCAL,entry.replace('.ts',platform==='node'?'.cjs':'.js')),bundle:true,format:platform==='node'?'cjs':'esm',platform,target:'es2022',nodePaths,metafile:true});
  for(const path of Object.keys(result.metafile.inputs)) manifest.inputs[path]=hash(readFileSync(resolve(path)));
}
json('build.json',manifest);
console.log('Built scalar API, coordinator and helper');
