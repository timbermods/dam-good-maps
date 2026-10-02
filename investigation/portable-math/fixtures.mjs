import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {deps,HERE,ROOT,LOCAL,json,hash} from './common.mjs';
import {adoptionPlugin} from './transform.mjs';
import {host} from './host.mjs';
const directory=process.env.DGM_OFFICIAL??'C:/Users/Kyler/code/DamGoodMaps/investigation/raw/builtin',goldenOnly=process.argv.includes('--golden-only'),actual=process.argv.includes('--actual');
const cases=[];
if(!goldenOnly){const names=readdirSync(directory).filter(n=>n.endsWith('.timber')&&!n.startsWith('_')).sort();if(names.length!==19)throw Error('Expected 19 official archives');for(const name of names){const bytes=readFileSync(resolve(directory,name));cases.push({id:'official-'+name.slice(0,-7),kind:'official',bytes:Uint8Array.from(bytes),inputHash:hash(bytes)});}}
const fixtures=JSON.parse(deps('fflate').strFromU8(deps('fflate').gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz'))))).fixtures;
for(const fixture of fixtures)for(const rules of ['game','port'])cases.push({id:'golden-'+fixture.name+'-'+rules,kind:'golden',fixture,rules});
const esbuild=deps('esbuild'),base={bundle:true,format:'esm',platform:'browser',nodePaths:[resolve(dirname(deps.resolve('fflate/package.json')),'..')]};
for(const mode of ['before','after'])await esbuild.build({...base,entryPoints:[resolve(HERE,'fixtures-api.ts')],outfile:resolve(LOCAL,'fixtures-'+mode+'-api.js'),plugins:mode==='after'&&!actual?[adoptionPlugin()]:[]});
const external={name:'separate-fixtures',setup(b){b.onResolve({filter:/^fixtures-(before|after)-api$/},a=>({path:'./'+a.path+'.js',external:true}));}};
await esbuild.build({...base,entryPoints:[resolve(HERE,'fixtures-worker.ts')],outfile:resolve(LOCAL,'fixtures-worker.js'),plugins:[external]});
const fingerprint=hash(Buffer.concat(['fixtures-before-api.js','fixtures-after-api.js','fixtures-worker.js'].map(n=>readFileSync(resolve(LOCAL,n))))),summary={fingerprint,total:cases.length,complete:0,engines:{},mismatches:[],changes:{},errors:[]},rows=[];
const h=await host(),browsers=[],engines={};
try{for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);engines[name]=b;summary.engines[name]=b.version();}
for(const c of cases){const row={id:c.id,inputHash:c.inputHash??hash(JSON.stringify(c.fixture)),results:{}};
 await Promise.all(Object.entries(engines).map(async([name,b])=>{const p=await b.newPage();try{await p.goto(h.url,{waitUntil:'domcontentloaded',timeout:120000});const result=await p.evaluate(c=>window.job('fixtures-worker.js',c),c);if(result.error)throw Error(c.id+' '+name+' '+result.error);row.results[name]=result;}finally{await p.close();}}));
 const ref=row.results.chromium.adopted;for(const [name,r]of Object.entries(row.results)){if(r.adopted.hash!==ref.hash)summary.mismatches.push({id:c.id,engine:name});for(const key of Object.keys(ref.components))if(r.baseline.components[key]!==r.adopted.components[key]){const k=name+'/'+c.kind+'/'+key;summary.changes[k]=(summary.changes[k]??0)+1;}}
 rows.push(row);summary.complete++;json('fixtures-progress.json',summary);console.log('FIXTURES',summary.complete+'/'+summary.total,c.id,summary.mismatches.length,'mismatches');
}}catch(e){summary.errors.push(String(e));throw e;}finally{await Promise.all(browsers.map(b=>b.close()));h.close();json('fixtures-summary.json',summary);json('fixtures-manifest.json',rows);}
if(summary.mismatches.length||summary.errors.length||summary.complete!==summary.total)process.exitCode=1;
