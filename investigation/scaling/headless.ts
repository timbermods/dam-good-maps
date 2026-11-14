import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {MapSession} from '../../src/core/doc/session';
import {decodeProject} from '../../src/core/doc/document';
import {readTimber,writeTimber} from '../../src/core/format/timber';
import {waterModel,mapObjects} from '../../src/core/sim/model';
import {canonicalSettle} from '../../src/core/sim/prefill';
import {WaterSim} from '../../src/core/sim/water';
import {surfaceOf} from '../../src/core/format/world';
import {meshChunk,chunkCount} from '../../src/render3d/mesh';
import {generate} from '../../src/core/gen/generate';
import {makeSpec} from '../../src/core/spec/mapspec';
import {createHash} from 'node:crypto';
const size=process.argv[2]??'128x128',repeat=Number(process.argv[3]??1);
const [W,H]=size.split('x').map(Number),dir=resolve('investigation/scaling'),local=resolve(dir,'local');
const retained=Function('return ('+readFileSync(resolve(dir,'retained.js'),'utf8')+')')();
const rows:any[]=[];
function measure(name:string,fn:()=>any){const at=Date.now(),t=performance.now();try{const value=fn();rows.push({name,at,ms:performance.now()-t,memory:process.memoryUsage()});return value;}catch(e){rows.push({name,at,ms:performance.now()-t,error:String(e)});return null;}}
function digest(b:Uint8Array){return createHash('sha256').update(b).digest('hex');}
let s:MapSession;
const bytes=readFileSync(resolve(local,'probe',`sizes-${size}.timber`));
const file=measure('read-timber',()=>readTimber(bytes));
const h=surfaceOf(file.world),model=waterModel(W,H,h,mapObjects(file.world));
const water=measure('water-settle',()=>canonicalSettle(model));
if(water)Object.assign(rows.at(-1),{ticks:water.ticks,retained:retained(water)});
rows.at(-1).water=retained(new WaterSim(model));
measure('mesh-all',()=>{const {nx,ny}=chunkCount(W,H);let quads=0,geometryBytes=0;for(let cy=0;cy<ny;cy++)for(let cx=0;cx<nx;cx++){const m=meshChunk({W,H,heights:h,columns:new Map()},cx,cy);quads+=m.quads;geometryBytes+=m.positions.byteLength+m.normals.byteLength+m.indices.byteLength;}rows.push({name:'geometry',quads,geometryBytes,chunks:nx*ny});});
s=measure('import-session',()=>MapSession.importMap(bytes,`sizes-${size}.timber`));
if(s){
  s.setWaterMode('defer');
  const baseline=measure('export-timber',()=>s.exportTimber().bytes);
  if(baseline)Object.assign(rows.at(-1),{bytes:baseline.length,sha256:digest(baseline)});
  const project=measure('save-project',()=>s.project());
  if(project)Object.assign(rows.at(-1),{bytes:project.length,sha256:digest(project)});
  const reopened=project&&measure('reopen-project',()=>MapSession.open(decodeProject(project)));
  if(reopened&&baseline)rows.at(-1).exportIdentical=digest(reopened.exportTimber().bytes)===digest(baseline);
let sessionStart=performance.now();
  const steps=Number(process.env.SCALING_STEPS??1024);
  for(let n=0;n<=steps;n++){
    if([0,8,32,64,128,512,1024].includes(n)){(globalThis as any).gc?.();rows.push({name:'editing-memory',step:n,elapsedMs:performance.now()-sessionStart,memory:process.memoryUsage(),retained:retained(s)});}
    if(n===steps)break;
    // Same successful operations in both variants, including on the old 255-coordinate limit.
    const x=2+(n*19)%(Math.min(W,256)-5),y=2+(n*31)%(Math.min(H,256)-5);
    const r=s.apply({op:'sculpt',params:{mode:'raise',cells:[[y,x,x+1]],amount:1,exact:true}});
    if(!r.ok)throw Error(JSON.stringify(r));
  }
  measure('undo',()=>s.undo());measure('redo',()=>s.redo());
  measure('water-resettle',()=>s.settleCanonical());
  const edited=measure('export-edited',()=>s.exportTimber().bytes);if(edited)Object.assign(rows.at(-1),{bytes:edited.length,sha256:digest(edited)});
  const p=measure('save-edited-project',()=>s.project());if(p){Object.assign(rows.at(-1),{bytes:p.length});const re=measure('reopen-edited-project',()=>MapSession.open(decodeProject(p)));rows.at(-1).exportIdentical=digest(re.exportTimber().bytes)===digest(edited);}
}
if(W<=256&&H<=256){const result=measure('generate-headless',()=>generate(makeSpec({seed:4242,theme:'highlands',size:{x:W,y:H}})));if(result)Object.assign(rows.at(-1),{attempts:result.attempts,passed:result.passed});}
else measure('generator-limit',()=>generate(makeSpec({seed:4242,size:{x:W,y:H}})));
const phase=process.env.SCALING_HEADLESS_PHASE??'before';mkdirSync(resolve(local,'headless-'+phase),{recursive:true});writeFileSync(resolve(local,'headless-'+phase,`${size}-${repeat}.json`),JSON.stringify({size,repeat,phase,rows},null,2));
console.log(size,repeat,rows.map(r=>`${r.name}:${r.error??Math.round(r.ms??0)}`).join(' '));
