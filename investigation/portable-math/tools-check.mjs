import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deps,HERE,ROOT,LOCAL,json,hash} from './common.mjs';
import {adoptionPlugin,transform} from './transform.mjs';
const official=process.env.DGM_OFFICIAL??'C:/Users/Kyler/code/DamGoodMaps/investigation/raw/builtin',rows={};
const toolsOverlay={name:'portable-tools',setup(b){b.onLoad({filter:/[\\/]tools[\\/].*\.[jt]s$/},({path})=>({contents:transform(readFileSync(path,'utf8'),path,resolve(HERE,'portable.ts').replaceAll('\\','/')),loader:'ts',resolveDir:dirname(path)}));}};
for(const mode of ['baseline','adopted']){
 const bundle=resolve(LOCAL,'official-baselines-'+mode+'.cjs'),output=resolve(LOCAL,'official-baselines-'+mode+'.json');
 await deps('esbuild').build({entryPoints:[resolve(ROOT,'tools/official-baselines.ts')],outfile:bundle,bundle:true,platform:'node',format:'cjs',nodePaths:[resolve(dirname(deps.resolve('fflate/package.json')),'..')],plugins:mode==='adopted'?[adoptionPlugin(),toolsOverlay]:[]});
 execFileSync(process.execPath,[bundle,'--dir',official,'--out',output],{cwd:LOCAL,windowsHide:true,stdio:'inherit'});rows[mode]={bundle:hash(readFileSync(bundle)),output:hash(readFileSync(output)),value:JSON.parse(readFileSync(output))};
}
const changes=[];
function compare(a,b,path=''){if(typeof a==='number'&&typeof b==='number'){if(!Object.is(a,b))changes.push({path,before:a,after:b});return;}if(a&&b&&typeof a==='object'&&typeof b==='object')for(const key of Object.keys(a))compare(a[key],b[key],path?path+'.'+key:key);else if(JSON.stringify(a)!==JSON.stringify(b))changes.push({path,before:a,after:b});}
compare(rows.baseline.value,rows.adopted.value);
json('tools-summary.json',{officialMaps:19,job:'tools/official-baselines.ts',baseline:{bundle:rows.baseline.bundle,output:rows.baseline.output},adopted:{bundle:rows.adopted.bundle,output:rows.adopted.output},changedValues:changes.length,changes});console.log('Official aggregate job',changes.length,'changed values');
