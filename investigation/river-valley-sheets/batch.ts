import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '../../src/core/gen/generate';
import { makeSpec } from '../../src/core/spec/mapspec';
import { outcomesOf } from '../../src/core/gen/outcomes';
import { readTimber } from '../../src/core/format/timber';
import { storedWater } from '../../src/core/format/world';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';
const mode = process.env.RV_MODE || 'dev';
const out = join(import.meta.dirname, 'local', process.env.RV_OUT || mode);
mkdirSync(out, {recursive:true});
const seeds = (process.env.RV_SEEDS || Array.from({length:30},(_,i)=>i+1).join(',')).split(',').map(Number);
const measures = [];
for (const seed of seeds) {
  let shown = 0, first: Uint8Array | undefined;
  const r = generate(makeSpec({seed,theme:'riverValley',size:{x:128,y:128},designedFor:'normal'}), {onLand:l=>{shown++;first ??= l.heights.slice();}});
  if (!r.bytes.length) throw new Error(`seed ${seed} failed: ${JSON.stringify(r.report)}`);
  const world = readTimber(r.bytes).world;
  const W=world.sizeX,H=world.sizeY,N=W*H;
  const heights=new Uint8Array(N),water=new Float64Array(N),contamination=new Float64Array(N);
  for(let i=0;i<N;i++) for(let z=0;z<world.layers;z++) if(world.voxels[z*N+i]) heights[i]=z+1;
  const sw=storedWater(world.singletons,W,H);
  for(let k=0;k<sw.tile.length;k++){water[sw.tile[k]]=sw.depth[k];contamination[sw.tile[k]]=sw.contamination[k];}
  const outcomes=outcomesOf({...r,built:{W,H,heights,water,contamination}});
  let changed=0, exportedChanged=0,wet=0,flatWet=0;
  for(let i=0;i<N;i++){if(first?.[i]!==heights[i])changed++;if(r.built.heights[i]!==heights[i])exportedChanged++;if(water[i]>.05){wet++;if(heights[i]===3)flatWet++;}}
  const m={seed,passed:r.report.passed,attempts:r.attempts,promise:outcomes.promise,readable:outcomes.story.readable,standout:outcomes.standout,summary:outcomes.summary,story:outcomes.story,signature:outcomes.signature,shown,changed,exportedChanged,wet,flatWet,sheet:r.info.sheet,straight:r.info.straight,checks:r.report.checks,walk:r.analysis?.walkReach};
  measures.push(m);
  writeFileSync(join(out,`${seed}.json`),JSON.stringify({W,H,heights:Array.from(heights),water:Array.from(water),contamination:Array.from(contamination),features:r.features,intentions:r.intentions,info:r.info,start:r.built.start}));
  writeFileSync(join(out,`${seed}.timber`),r.bytes);
  const rgb=shadeTiles(heights,W,H,water),img=new Uint8Array(rgb.length);
  for(let y=0;y<H;y++)img.set(rgb.subarray(y*W*3,(y+1)*W*3),(H-1-y)*W*3);
  const dot=(x:number,y:number,c:number[],rad:number)=>{for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<W&&yy<H)img.set(c,((H-1-yy)*W+xx)*3);}};
  for(let i=0;i<N;i++)if(water[i]>.05&&contamination[i]>=.05)dot(i%W,Math.floor(i/W),[155,55,190],0);
  for(const e of r.built.entities)if(e.template==='BadwaterSource')dot(e.x+1,e.y+1,[155,55,190],2);
  if(r.built.start)dot(r.built.start.x,r.built.start.y,[240,30,40],2);
  writeFileSync(join(out,`${seed}.png`),encodePng(img,W,H));
  writeFileSync(join(out,'measures.json'),JSON.stringify(measures,null,2)+'\n');
  console.log(`${mode} ${seed}: promise ${m.promise}, readable ${m.readable}, wet ${wet}, bed3 ${flatWet}, shown/changed ${shown}/${changed}`);
}
