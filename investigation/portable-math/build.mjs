import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {deps,ROOT,HERE,LOCAL,hash,json} from './common.mjs';
import {adoptionPlugin,transform} from './transform.mjs';
const output=process.env.DGM_BUILD_OUTPUT?resolve(LOCAL,process.env.DGM_BUILD_OUTPUT):LOCAL;
if(output!==LOCAL&&!output.startsWith(LOCAL+resolve('/').slice(-1))&&!output.startsWith(LOCAL+'\\'))throw Error('Build output must stay under local/');
mkdirSync(output,{recursive:true});
const esbuild=deps('esbuild'),nodePaths=[resolve(dirname(deps.resolve('fflate/package.json')),'..')];
const manifest={inputs:{},esbuild:esbuild.version};
const actual=process.argv.includes('--actual');
const base={bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths,metafile:true};
const external={name:'separate-apis',setup(b){b.onResolve({filter:/^(baseline|adopted)-api$/},args=>({path:'./'+args.path+'.js',external:true}));}};
for(const [entry,out,plugins]of [
  ['api.ts','baseline-api.js',[]],['api.ts','adopted-api.js',[adoptionPlugin()]],
  ['generation-worker.ts','generation-worker.js',[external]],
  ['coordinator.ts','coordinator.js',[adoptionPlugin()]],['weather-coordinator.ts','weather-coordinator.js',[adoptionPlugin()]],
  ['helper.ts','helper.js',[adoptionPlugin()]],['curve-probe.ts','curve-baseline.js',[]],['curve-probe.ts','curve-adopted.js',[adoptionPlugin()]],
]){
  const r=await esbuild.build({...base,entryPoints:[resolve(HERE,entry)],outfile:resolve(output,out),plugins:actual?plugins.filter(p=>p.name!=='portable-math-overlay'):plugins});
  for(const file of Object.keys(r.metafile.inputs))manifest.inputs[file]=hash(readFileSync(resolve(file)));
}
manifest.fingerprint=hash(JSON.stringify(manifest));writeFileSync(resolve(output,'build.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Built baseline and portable generation, water, helpers and Weather probes',manifest.fingerprint);
