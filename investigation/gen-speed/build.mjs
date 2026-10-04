import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export const dir = dirname(fileURLToPath(import.meta.url));
export const root = resolve(dir, '../..');
const deps = process.env.DGM_DEPS ?? resolve(root, '../../../startup/local/checkout');
export const require = createRequire(resolve(deps, 'package.json'));
const esbuild = require('esbuild');
const ts = require('typescript');
mkdirSync(resolve(dir, 'local'), { recursive: true });
const groups = {
  'gen/generate.ts': ['generate','attemptOnce','planLandStage','plannedWater','lowerShelves','settlerOn'],
  'land/field.ts': ['makeField'], 'land/hydro.ts': ['planHydro'],
  'land/drainage.ts': ['drainage'], 'land/minePads.ts': ['minePads','roomMap'],
  'land/archipelago.ts': ['islandStage'], 'land/delta.ts': ['deltaField','deltaHydro'],
  'gen/settler.ts': ['pickStart','prepareStart'], 'land/hazards.ts': ['planBadwater'],
  'gen/intentions.ts': ['settlerView'],
  'analysis/ridge.ts': ['damWalls'], 'analysis/straight.ts': ['straightness'],
  'features/build.ts': ['buildMap'], 'sim/prefill.ts': ['prefill','spillLevels','canonicalSettle'],
  'sim/water.ts': ['settle'], 'sim/drought.ts': ['droughtStorage'],
  'validate/checks.ts': ['validateMap'], 'gen/outcomes.ts': ['outcomesOf'],
};
function instrument(source, file) {
  const names = groups[file]; if (!names) return source;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.body && names.includes(n.name?.text)) {
      const label = file + ':' + n.name.text;
      const detail=file==='sim/drought.ts'&&n.name.text==='droughtStorage'?'globalThis.__gs?.drought?.(m, depth, days);':'';
      edits.push([n.body.getStart(ast)+1, `${detail}const __gsp = globalThis.__gs?.enter(${JSON.stringify(label)}); try {`]);
      edits.push([n.body.end-1, '} finally { globalThis.__gs?.leave(__gsp); }']);
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
  for (const [at,text] of edits.sort((a,b)=>b[0]-a[0])) source=source.slice(0,at)+text+source.slice(at);
  return source;
}
export async function build(variant='before', profile=false, platform='node', extras=false) {
  const trialPath=JSON.parse(process.env.GEN_TRIAL_VARIANTS??'{}')[variant];
  const flavor=trialPath?'round2':variant;
  const outfile=resolve(dir,`local/${variant}${profile?'-profile':''}${platform==='browser'?'-browser':''}${extras?'-tools':''}.mjs`);
  let entry=`export {generate} from ${JSON.stringify(resolve(root,'src/core/gen/generate.ts'))};
export {decodeSpecFragment,AVAILABLE_THEMES} from ${JSON.stringify(resolve(root,'src/core/spec/mapspec.ts'))};
export {damWalls} from ${JSON.stringify(resolve(root,'src/core/analysis/ridge.ts'))};
export {generatedDocument,encodeProject,decodeProject} from ${JSON.stringify(resolve(root,'src/core/doc/document.ts'))};
export {MapSession} from ${JSON.stringify(resolve(root,'src/core/doc/session.ts'))};`;
  if(extras)entry+=`\nexport {pickStart${flavor==='after'?',prepareStart':''}} from ${JSON.stringify(resolve(root,'src/core/gen/settler.ts'))};
export {roomMap} from ${JSON.stringify(resolve(root,'src/core/land/minePads.ts'))};
export {stream} from ${JSON.stringify(resolve(root,'src/core/math/rng.ts'))};`;
  if(extras)entry+=`\nexport {prefill} from ${JSON.stringify(resolve(root,'src/core/sim/prefill.ts'))};\nexport {outcomesOf} from ${JSON.stringify(resolve(root,'src/core/gen/outcomes.ts'))};`;
  await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile,bundle:true,format:'esm',platform, target:'es2022', nodePaths:[resolve(deps,'node_modules')],plugins:[{name:'investigation-only',setup(b){b.onResolve({filter:/portable$/},args=>flavor==='round2'?{path:resolve(dirname(args.importer),args.path+'.ts')}:null);b.onLoad({filter:/[\\/]src[\\/]core[\\/].*\.ts$/},args=>{
    const file=relative(resolve(root,'src/core'),args.path).replaceAll('\\','/');
    let source='';try{source=readFileSync(args.path,'utf8');}catch(e){if(e.code!=='ENOENT'||flavor!=='round2')throw e;}
    const replacement=resolve(dir,'candidate',file);
    if(flavor==='after'||flavor==='round2') { try {source=readFileSync(replacement,'utf8');} catch(e) {if(e.code!=='ENOENT')throw e;} }
    if(flavor==='round2') { try {source=readFileSync(resolve(dir,trialPath??process.env.GEN_ROUND2_CANDIDATE??'round2/candidate',file),'utf8');} catch(e) {if(e.code!=='ENOENT')throw e;} }
    if(profile)source=instrument(source,file);
    return {contents:source,loader:'ts',resolveDir:dirname(args.path)};
  });}}]});
  return outfile;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  for(const variant of ['before','after']) for(const profile of [false,true]) await build(variant,profile);
}
