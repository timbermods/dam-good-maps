import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,deps,json,hash} from './common.mjs';
const ts=deps('typescript');
export const kernels={
 'math/grid.ts':['distanceFrom','levelRegions'],
 'analysis/walk.ts':['walkDistance'],
 'analysis/damsites.ts':['damSites'],
 'analysis/regions.ts':['walkRegions','landRegions','components'],
 'sim/prefill.ts':['spillLevels'],
 'land/minePads.ts':['roomMap'],
};
const profiles={...kernels,'validate/playability.ts':['checkPlayability','checkStart','colonyReach','minesReached','checkContained','checkSourcesInFlow','checkOutflow','checkExtras'],
 'validate/checks.ts':['validateMap','validateFile'],'analysis/metrics.ts':['measure'],'gen/outcomes.ts':['outcomesOf'],
 'land/minePads.ts':['roomMap','minePads'],'gen/settler.ts':['pickStart'],'analysis/signature.ts':['signatureOf'],'analysis/story.ts':['waterStory']};
const inputs={};
for(const platform of ['node','browser']){
 await deps('esbuild').build({entryPoints:[resolve(HERE,'api.ts')],outfile:resolve(LOCAL,platform==='node'?'api.cjs':'api.js'),bundle:true,format:platform==='node'?'cjs':'esm',platform,target:'es2022',nodePaths:[resolve(dirname(deps.resolve('esbuild/package.json')),'..')],plugins:[{name:'analysis-hooks',setup(b){b.onLoad({filter:/[\\/]src[\\/]core[\\/].*\.ts$/},a=>{
 const file=relative(resolve(ROOT,'src/core'),a.path).replaceAll('\\','/');let source=readFileSync(a.path,'utf8');inputs[file]=hash(source.replaceAll('\r\n','\n'));
 const names=profiles[file];if(!names)return {contents:source,loader:'ts'};
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[];
 for(const n of ast.statements)if(ts.isFunctionDeclaration(n)&&n.body&&names.includes(n.name?.text)){
 const name=n.name.text,label=file+':'+name;
 const replace=kernels[file]?.includes(name)?`const __replacement=globalThis.__ra?.replace(${JSON.stringify(name)},Array.from(arguments));if(__replacement!==undefined)return __replacement;`:'';
 edits.push([n.body.getStart(ast)+1,`const __token=globalThis.__ra?.enter(${JSON.stringify(label)});try{${replace}`]);
 edits.push([n.body.end-1,'}finally{globalThis.__ra?.leave(__token);}']);
 }for(const [at,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,at)+text+source.slice(at);
 return {contents:source,loader:'ts',resolveDir:dirname(a.path)};
 });}}]});
}
// Export the actual M9b measure function, dropping only its CLI dispatch.
let m9b=readFileSync(resolve(ROOT,'investigation/m9b/measures.ts'),'utf8');m9b=m9b.slice(0,m9b.indexOf('// ------------------------------------------------------------------------------------ the batch')).replace('function measureOne(','export function measureOne(');
writeFileSync(resolve(LOCAL,'m9b.ts'),m9b.replace(/from '[^']*src\/[^']*'/g,"from './api.cjs'").replace("require('../probe/runner/model')",`require(${JSON.stringify(resolve(ROOT,'investigation/probe/runner/model'))})`));
await deps('esbuild').build({entryPoints:[resolve(LOCAL,'m9b.ts')],outfile:resolve(LOCAL,'m9b.cjs'),bundle:true,platform:'node',format:'cjs',external:['./api.cjs',resolve(ROOT,'investigation/probe/runner/model')],nodePaths:[resolve(dirname(deps.resolve('esbuild/package.json')),'..')]});
await deps('esbuild').build({entryPoints:[resolve(HERE,'bridge.ts')],outfile:resolve(LOCAL,'bridge.cjs'),bundle:true,platform:'node',format:'cjs'});
await deps('esbuild').build({entryPoints:[resolve(HERE,'bridge.ts')],outfile:resolve(LOCAL,'bridge.js'),bundle:true,platform:'browser',format:'esm'});
json('build.json',{base:execFileSync('git',['rev-parse','origin/feature/m9b'],{cwd:ROOT,encoding:'utf8'}).trim(),inputs});
console.log('Built baseline with investigation-only hooks');
deps('esbuild').stop();
