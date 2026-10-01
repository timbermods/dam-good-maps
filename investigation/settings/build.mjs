import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const dir=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(dir,'../..');
const mode=process.argv[2]??'prototype';
if(!['baseline','verticality','lakes','prototype'].includes(mode))throw Error('Unknown overlay mode: '+mode);
const tag=process.argv[3];
if(tag&&!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid build tag');
const output=tag?`${mode}-${tag}`:mode;
mkdirSync(resolve(dir,'local'),{recursive:true});
const changes=new Map();
function edit(path,fn){const before=readFileSync(resolve(root,path),'utf8');changes.set(path,{before,after:fn(before)});}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Anchor is not unique: '+a.slice(0,80));return s.replace(a,b);}
function add(path,source){changes.set(path,{before:'',after:readFileSync(resolve(dir,source),'utf8')});}
function chain(path,fn){const prev=changes.get(path);const before=prev?.before??readFileSync(resolve(root,path),'utf8');changes.set(path,{before,after:fn(prev?.after??before)});}
if(mode!=='baseline') {
  add('src/core/land/settingsShape.ts','prototype/settingsShape.ts');
  chain('src/core/gen/generate.ts',s=>replace(replace(s,'import { enableIslandPrototype','import { settingsShapeSpec } from "../land/settingsShape";\nimport { enableIslandPrototype'),'enableIslandPrototype(g, specIn)',`enableIslandPrototype(g, settingsShapeSpec(specIn, ${mode==='verticality'?1:mode==='lakes'?2:3}))`));
  if(mode!=='lakes') {
    add('src/core/land/verticality.ts','prototype/verticality.ts');
    edit('src/core/land/genome.ts',s=>replace(replace(s,'import { stream, type Rng }','import { verticalityRange } from "./verticality";\nimport { stream, type Rng }'),'  // terracing: the benched share','  verticalityRange(g, s);\n  // terracing: the benched share'));
    chain('src/core/gen/generate.ts',s=>{
      s=replace(s,'import { settingsShapeSpec }','import { verticalityIslands, verticalityIslandBudget, verticalityDelta, verticalityDraw, verticalityShape, verticalityContourField } from "../land/verticality";\nimport { settingsShapeSpec }');
      s=replace(s,'h0: snapLevels(E, g, seed, W, H)','h0: verticalityContourField(snapLevels(E, g, seed, W, H),g)');
      s=replace(s,'vt: specIn.settings.terrain.verticality, intentions: keep','vt: verticalityDraw(specIn), intentions: keep');
      s=replace(s,'deltaField(g, seed, W, H)','deltaField(verticalityShape(g), seed, W, H)');
      s=replace(s,'deltaHydro(h, g, seed, W, H)','deltaHydro(h, verticalityShape(g), seed, W, H)');
      s=replace(s,'if (islandPrototypeEnabled(g) && !ctx) return islandStage(g, seed, W, H, attempt);','if (islandPrototypeEnabled(g) && !ctx) { const st = verticalityIslandBudget(g,()=>islandStage(g, seed, W, H, attempt)); verticalityIslands(st.h, g, W, H); return st; }');
      return replace(s,'  // (M9b: the banks beside an inflow', '  if(g.theme === "delta" && !ctx) verticalityDelta(h, g, hy.water);\n  // (M9b: the banks beside an inflow');
    });
  }
  if(mode!=='verticality') {
    add('src/core/land/lakes.ts','prototype/lakes.ts');
    const prev=changes.get('src/core/land/genome.ts');
    const before=prev?.before??readFileSync(resolve(root,'src/core/land/genome.ts'),'utf8');
    let after=prev?.after??before;
    after=replace(after,'import { stream, type Rng }','import { lakeRange } from "./lakes";\nimport { stream, type Rng }');
    after=replace(after,'  lakeSpringMax?: number;','  lakeAmount?: number;\n  lakeSpringMax?: number;');
    const start=after.indexOf('  // lakes and basins\n'); const end=after.indexOf('  // waterfalls\n',start);
    if(start<0||end<0)throw Error('Missing lakes block');
    after=after.slice(0,start)+'  // The setting is an absolute additional-water budget, above signature water.\n  lakeRange(g, s, W, H);\n'+after.slice(end);
    changes.set('src/core/land/genome.ts',{before,after});
    chain('src/core/gen/generate.ts',s=>{
      s=replace(s,'import { settingsShapeSpec }','import { connectedLakes, lakeKeep, lakeSubstrate } from "../land/lakes";\nimport { settingsShapeSpec }');
      s=replace(s,'  // (M9b: the banks beside an inflow','  if(!ctx)lakeSubstrate(h,g);\n  // (M9b: the banks beside an inflow');
      return replace(s,'      hLand.set(h);',`      // Grow standing water after the theme's land, starts, mine room and hollows are prepared,
      // before the first land is shown. The control cannot consume that prepared play space.
      if(g.lakeAmount){
        const keepL=lakeKeep(W,H,[protect,ctx?.locked?.mask,mineKeep,mineWay,bad.avoid,pool,ramps.tiles],[guess,second,...prepared].filter((p):p is StartPick=>!!p));
        connectedLakes(h,W,H,g,seed,attempt,hy,keepL);
        const read=lakeFeatures(hy,W,H,seed);
        lakes.splice(0,lakes.length,...read);
        for(const lake of lakes)contains.add(lake.id);
        rivers=[...hy.rivers,...lakes,...(weir?[weir.feature]:[]),...(plug?[plug.feature]:[]),...(ctx?.features??[])];
        if(droppedPre.length)dropRivers(droppedPre);
        for(let i=0;i<N;i++)if(hy.water[i]===1||hy.water[i]===2)keep[i]=1;
        planned!.hy=structuredClone(hy);planned!.lakes=structuredClone(lakes);
        if(info.hydro)info.hydro.lakes=hy.lakes.length;
        shownFill=null;
      }
      hLand.set(h);`);
    });
    edit('src/core/spec/mapspec.ts',s=>replace(s,'    lakes: "none" | "few" | "some" | "many";','    lakes: "none" | "few" | "some" | "many";\n    /** Continuous prototype budget; when absent, None/Few/Some/Many map to 0/25/50/100. */\n    lakeAmount?: number; // 0–100'));
    edit('src/core/spec/mapspec.schema.json',s=>replace(s,'"lakes": { "enum": ["none", "few", "some", "many"] },','"lakes": { "enum": ["none", "few", "some", "many"] },\n              "lakeAmount": { "type": "integer", "minimum": 0, "maximum": 100 },'));
    edit('src/core/spec/codec.ts',s=>replace(s,'  { key: "wf",','  { key: "la", path: ["water", "lakeAmount"], kind: "int" },\n  { key: "wf",'));
  }
}
const plugin={name:'settings-overlay',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{
  const path=relative(root,args.path).replaceAll('\\','/');const entry=changes.get(path);
  if(entry)return {contents:entry.after,loader:path.endsWith('.json')?'json':'ts',resolveDir:resolve(args.path,'..')};
}); b.onResolve({filter:/\/(lakes|verticality|settingsShape)$/},args=>{
  const path=resolve(args.resolveDir,args.path+'.ts'); if(changes.has(relative(root,path).replaceAll('\\','/')))return {path};
});}};
writeFileSync(resolve(dir,`local/${output}-overlay.json`),JSON.stringify(Object.fromEntries(changes)));
const stamp={base:execFileSync('git',['rev-parse','origin/feature/m9b'],{encoding:'utf8'}).trim(),mode,overlayHash:createHash('sha256').update(JSON.stringify(Object.fromEntries(changes))).digest('hex')};
writeFileSync(resolve(dir,`local/${output}-build.json`),JSON.stringify(stamp));
await build({entryPoints:[resolve(dir,'run.ts')],outfile:resolve(dir,`local/${output}.mjs`),bundle:true,platform:'node',format:'esm',target:'node24',plugins:[plugin],define:{SETTINGS_BUILD:JSON.stringify(stamp)},logLevel:'warning'});
await build({entryPoints:[resolve(dir,'render.ts')],outfile:resolve(dir,'local/render.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'warning'});
if(mode==='prototype')await build({entryPoints:[resolve(dir,'guards.ts')],outfile:resolve(dir,'local/guards.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',plugins:[plugin],logLevel:'warning'});
if(mode!=='baseline'){
  const patch=[];
  for(const [path,{before,after}]of changes){
    const old=resolve(dir,`local/${mode}-old.txt`), next=resolve(dir,`local/${mode}-new.txt`);writeFileSync(old,before);writeFileSync(next,after);
    let diff;try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',old,next],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
    const lines=diff.split('\n'); const hunk=lines.findIndex(l=>l.startsWith('@@'));
    patch.push(`diff --git a/${path} b/${path}\n${before?'':'new file mode 100644\n'}--- ${before?'a/'+path:'/dev/null'}\n+++ b/${path}\n`+lines.slice(hunk).join('\n'));
  }
  writeFileSync(resolve(dir,tag?`local/${output}.patch`:`${mode}.patch`),patch.join(''));
}
console.log(`Built ${mode} without writing product source.`);
