import {resolve,dirname} from 'node:path';
import {HERE,ROOT,LOCAL,deps} from './common.mjs';
const build=deps('esbuild').build,nodePaths=[resolve(dirname(deps.resolve('fflate/package.json')),'..')];
const base={bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths};
await build({...base,entryPoints:[resolve(HERE,'api.ts')],outfile:resolve(LOCAL,'reference-api.js')});
await build({...base,entryPoints:[resolve(HERE,'helper.ts')],outfile:resolve(LOCAL,'runtime-helper.js')});
await build({...base,entryPoints:[resolve(HERE,'runtime-smoke.ts')],outfile:resolve(LOCAL,'runtime-smoke.js')});
await build({...base,entryPoints:[resolve(HERE,'generation-coordinator.ts')],outfile:resolve(LOCAL,'generation-coordinator.js'),plugins:[{name:'investigation-water',setup(b){
  b.onResolve({filter:/^reference-api$/},()=>({path:'./reference-api.js',external:true}));
  b.onResolve({filter:/water$/},args=>{if(resolve(args.resolveDir,args.path)===resolve(ROOT,'src/core/sim/water'))return {path:resolve(HERE,'water.ts')};});
}}]});
console.log('Built generation factory adapter');
