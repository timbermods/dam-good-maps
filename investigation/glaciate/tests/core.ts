import assert from 'node:assert/strict';
import { writeFileSync,mkdirSync } from 'node:fs';
import { fixture } from './fixtures';
import { DEFAULTS,makePlan,Valley,waterRun,nextSeed,type Plan } from '../model';
import { snapshot,json,modelFor,storedMap } from '../../forces-core/core/map';
import { startProblem } from '../../forces-core/core/objects';
import { Session } from '../session';
import { signature,applyOperation } from '../operation';
import { prefill,canonicalSettle,spillLevels } from '../../../src/core/sim/prefill';
import { readTimber } from '../../../src/core/format/timber';
import { timber } from '../export';
import { CarveRun,DEFAULTS as CARVE } from '../../../src/core/forces/carve/run';
mkdirSync('checks',{recursive:true});mkdirSync('local/results',{recursive:true});
let checks=0;const ok=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
const rows:any[]=[];
export const cases=[
 {id:'default',map:'river-128',x:64,y:16}, {id:'small-map',map:'river-96',x:52,y:16},
 {id:'side-valleys',map:'highlands-128',x:64,y:96}, {id:'large-map',map:'highlands-256',x:80,y:112},
 {id:'lobe',map:'river-128',x:32,y:32}, {id:'low-ground',map:'highlands-256',x:208,y:112},
 {id:'tall',map:'tall-128',x:32,y:80}, {id:'aim',map:'river-128',x:28,y:80,end:[97,35]},
 {id:'power-low',map:'river-128',x:96,y:32,power:15}, {id:'power-default',map:'river-128',x:96,y:32,power:60}, {id:'power-high',map:'river-128',x:96,y:32,power:95},
 {id:'another-1',map:'river-128',x:64,y:16,seed:nextSeed(891)}, {id:'another-2',map:'river-128',x:64,y:16,seed:nextSeed(nextSeed(891))},
 {id:'another-3',map:'river-128',x:64,y:16,seed:nextSeed(nextSeed(nextSeed(891)))},
] as const;
let defaultPlan:Plan|undefined;
for(const c of cases){
 const m=fixture(c.map),s={...DEFAULTS,...('power'in c?{power:c.power}:{}),...('seed'in c?{seed:c.seed}:{}),...('end'in c?{mode:'aim' as const}:{})},intent={origin:c.y*m.W+c.x,...('end'in c?{end:c.end[1]*m.W+c.end[0]}:{})};
 const original=signature(m),t0=performance.now();
 try{
 const p=makePlan(m,s,intent),planMs=performance.now()-t0,q=makePlan(m,s,intent);
 ok(signature(p.map)===signature(q.map),'same gesture and seed');ok(signature(m)===original,'input unmodified');
 ok(p.map.heights.every(h=>h>=0&&h<=22),'floor and ceiling');
 const cut=m.heights.reduce((a,h,i)=>a+Math.max(0,h-p.map.heights[i]),0),deposited=m.heights.reduce((a,h,i)=>a+Math.max(0,p.map.heights[i]-h),0);
 ok(cut===deposited&&cut===p.metrics.cut,'all excavated blocks deposited');
 const plants=p.map.entities.filter(e=>/^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.template));
 ok(new Set(plants.map(e=>e.x+','+e.y)).size===plants.length,'displaced trees never overlap existing plants');
 const run=waterRun(p);let settled=null;while(!settled)settled=run.advance(128);p.map.water={depth:settled.depth.slice(),contamination:settled.contamination.slice()};
 const fresh=waterRun(p);let again=null;while(!again)again=fresh.advance(31);ok(p.map.water.depth.every((d,i)=>d===again!.depth[i]),'fresh settle starts with identical stored lake water');
 const sourceOnly={...modelFor(p.map),emitters:modelFor({...p.map,entities:p.map.entities.filter(e=>e.owner==='glaciate')}).emitters};
 const fed=prefill(sourceOnly),spill=spillLevels(modelFor(p.map));
 for(const b of p.basins){ok(b.depth>0&&b.tiles.every(i=>spill[i]>p.map.heights[i]),'basin below actual flood outlet');ok(b.tiles.some(i=>fed.depth[i]>.01),'head meltwater feeds basin');}
 const session=new Session(m);session.start(p.request);session.active!.plan=p;session.frame(1.5);session.cancel();ok(signature(session.map)===original,'Esc restores advance exactly');
 session.start(p.request);session.active!.plan=p;session.frame(4);session.undo();ok(signature(session.map)===original,'undo restores retreat exactly');
 session.start(p.request);session.active!.plan=p;const op=session.finish({settled:settled.settled,ticks:settled.ticks});
 ok(signature(applyOperation(m,JSON.parse(JSON.stringify(op))))===signature(p.map),'exact JSON replay');session.undo();ok(signature(session.map)===original,'one undo restores entire state');session.redo();ok(signature(session.map)===signature(p.map),'exact redo');
 const saved=session.export(),other=new Session(m);other.import(saved);ok(signature(other.map)===signature(session.map),'portable saved project');
 const corrupt=structuredClone(op);corrupt.params.terrain[0][2]=999;assert.throws(()=>applyOperation(m,corrupt));checks++;
 const file=readTimber(timber(p.map)),cols=String((file.world.singletons.WaterMapNew as any).WaterColumns.Array).split(' ');
 ok(p.map.water.depth.every((d,i)=>Math.abs((cols[i]==='0'?0:Number(cols[i].split(':')[0]))-d)<1e-5),'export stores displayed water');
 ok(file.world.voxels.slice(22*m.W*m.H).every(v=>v===0),'empty ceiling layer');
 const record={...c,settings:s,intent,planningMs:planMs,settled:settled.settled,ticks:settled.ticks,signature:signature(p.map),metrics:p.metrics,basins:p.basins.map(b=>({floor:b.floor,outlet:b.outlet,depth:b.depth,tiles:b.tiles.length,fed:b.fed})),hangingCrossingTiles:p.hanging.length,notice:p.notice,refused:null};
 rows.push(record);writeFileSync('local/results/'+c.id+'.json',JSON.stringify(json(p.map)));console.log(c.id,JSON.stringify({...p.metrics,basins:record.basins.length,settled:settled.settled}));
 if(c.id==='default')defaultPlan=p;
 }catch(e){rows.push({...c,refused:String(e)});console.error(c.id,String(e));throw e;}
}
const p=defaultPlan!,m=p.before;
const start=m.entities.find(e=>e.template==='StartingLocation')!;
assert.throws(()=>makePlan(m,DEFAULTS,{origin:start.y*m.W+start.x}),/Start here/);checks++;
const changed=makePlan(m,{...DEFAULTS,seed:nextSeed(DEFAULTS.seed)},p.request.intent);ok(signature(changed.map)!==signature(makePlan(m,DEFAULTS,p.request.intent).map),'Try another changes the result');
const dry=makePlan(m,{...DEFAULTS,meltwater:false},p.request.intent);ok(!dry.map.entities.some(e=>e.owner==='glaciate')&&dry.retained.depth.every(v=>v===0),'Meltwater off adds no water/source');
ok(p.metrics.centreline>=p.metrics.valley-1e-10,'trough never straighter than the followed valley');
const alt=new Session(m);alt.start(p.request);alt.active!.plan=p;alt.finish({settled:true,ticks:0});const prev=signature(alt.map);alt.start(p.request,true);alt.frame(2);alt.cancel();ok(signature(alt.map)===prev,'cancel alternate returns previous glacier');
const alt2=alt.start(p.request,true);ok(alt2.request.settings.seed!==nextSeed(DEFAULTS.seed),'cancel consumes variation seed');alt.cancel();
// Actual Carve on dev: maximum Width, full Power (its deep, uncapped excavation), Steep, low Wander.
const carve=new CarveRun(m,{...CARVE,power:100,width:24,wander:5,walls:'steep',seed:891},p.request.intent);
for(let k=0;!carve.done&&k<5000;k++)carve.step();ok(carve.done,'Carve comparison completes');
const water=canonicalSettle(modelFor({...m,...carve.map}));carve.map.water={depth:water.depth,contamination:water.contamination};
writeFileSync('local/results/carve.json',JSON.stringify(json({...m,...carve.map})));
const comparison={settings:carve.settings,metrics:carve.metrics,glacier:p.metrics,limitation:'dev Carve has no separate Depth setting; full Power uses its uncapped deep excavation. No feature/forces dependency.'};
writeFileSync('checks/core.json',JSON.stringify({checks,cases:rows,comparison},null,2)+'\n');
console.log('PASS',checks);
