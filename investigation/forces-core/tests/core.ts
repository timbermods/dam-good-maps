import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fixture} from '../demo/maps';
import {ForceSession} from '../core/session';
import {snapshot,json,normalize,storedMap} from '../core/map';
import {applyOperation,signature,operation} from '../core/operation';
import {DEFAULTS,refusal,prepare,carve,quake,type ForceRequest} from '../verbs';
import {Slicer,Cancelled} from '../core/scheduler';
import {OPTIONS} from '../core/options';
import {ForceInput} from '../core/input';
import {transportRock} from '../core/rock';
import {canonicalSettle} from '../../../src/core/sim/prefill';
import {modelFor} from '../core/map';
const passed:string[]=[];const pass=(s:string)=>{passed.push(s);console.log('PASS '+s);};
const base=fixture('plain',32);
const requests:ForceRequest[]=[
 {verb:'craterize',settings:{...DEFAULTS.craterize,power:25,size:16,seed:15},intent:{origin:24*32+24}},
 {verb:'erupt',settings:{...DEFAULTS.erupt,power:28,seed:26},intent:{origin:24*32+24}},
 {verb:'quake',settings:{...DEFAULTS.quake,power:32,seed:21},intent:{path:[{x:0,y:23},{x:31,y:23}],side:1}},
 {verb:'quake',settings:{...DEFAULTS.quake,mode:'slide',power:32,seed:21},intent:{path:[{x:0,y:23},{x:31,y:23}],side:-1}},
 {verb:'carve',settings:{...DEFAULTS.carve,mode:'aim',power:45,dry:true,width:3,seed:0},intent:{origin:29*32+24,end:2*32+24}}
];
async function complete(s:ForceSession,r:ForceRequest,reroll=false){
 await s.start(r,reroll);let steps=0;while(s.active){assert(++steps<2400);await s.advance();}
}
for(const r of requests){
 const a=new ForceSession(base),b=new ForceSession(base);await complete(a,r);await complete(b,r);
 assert.deepEqual(a.map,b.map);assert.equal(a.past.length,1);assert.equal(a.past[0].op.op,'forceResult');
 const after=snapshot(a.map),op=json(a.past[0].op);
 assert.deepEqual(applyOperation(base,op),after);assert.deepEqual(applyOperation(after,op,true),base);
 a.undo();assert.deepEqual(a.map,base);a.redo();assert.deepEqual(a.map,after);
 assert.throws(()=>applyOperation(after,op),/conflicts/);
 const restored=new ForceSession(base);restored.import(a.export());assert.deepEqual(restored.map,after);
 assert.deepEqual(snapshot(base),base);
 pass(r.verb+'/'+r.settings.mode+': deterministic, one operation, exact undo/redo and saved replay');
}
const history=new ForceSession(base);
for(const r of requests.slice(0,3))await complete(history,r);
const chain=snapshot(history.map),bundle=history.export();
for(let k=0;k<3;k++)history.undo();assert.deepEqual(history.map,base);
for(let k=0;k<3;k++)history.redo();assert.deepEqual(history.map,chain);
const imported=new ForceSession(base);imported.import(json(bundle));assert.deepEqual(imported.map,chain);
pass('Craterize → Erupt → Quake shares one map, one geology layer and one history');
const reroll=new ForceSession(base);await complete(reroll,requests[1]);const first=snapshot(reroll.map);
await complete(reroll,requests[1],true);const second=snapshot(reroll.map);
assert.equal(reroll.past[1].op.params.request.settings.seed,27);assert(reroll.past[1].op.params.replaces);
const reference=new ForceSession(base);await complete(reference,{...requests[1],settings:{...requests[1].settings,seed:27}} as ForceRequest);
assert.deepEqual(second,reference.map);reroll.undo();assert.deepEqual(reroll.map,first);reroll.redo();
const reopen=new ForceSession(base);reopen.import(reroll.export());await complete(reopen,requests[1],true);
assert.equal(reopen.past.at(-1)!.op.params.request.settings.seed,28);
await reopen.start(requests[1],true);reopen.cancel();assert.equal(reopen.past.length,3);
pass('Try another replaces from original ground; saved alternatives keep their base and next seed');
for(const r of requests){
 const s=new ForceSession(base);await s.start(r);assert(s.cancel());assert.deepEqual(s.map,base);assert.equal(s.past.length,0);
}
pass('Esc restores exact terrain, objects, water and hidden rock for every force');
for(const verb of ['carve','craterize','erupt','quake'] as const){
 const request=verb==='quake'?{verb,settings:DEFAULTS.quake,intent:{path:[{x:0,y:10},{x:31,y:10}],side:1}}:
 {verb,settings:DEFAULTS[verb],intent:{origin:10*32+9}};
 assert.equal(refusal(base,request as ForceRequest),'Start here');
 assert.equal(OPTIONS[verb][0].key,'mode');
}
pass('Every force shares the quiet start refusal and begins its options with Mode');
const pen=new ForceInput(32,32);pen.begin({x:4,y:25});pen.move({x:28,y:25});pen.flip();
assert.equal((pen.request('quake',DEFAULTS.quake) as any).intent.side,-1);pen.end({x:28,y:25});
pen.begin({x:4,y:22},true);assert.deepEqual(pen.origin,{x:28,y:25});pen.cancel();assert.equal(pen.anchor,null);
pass('Paint, Shift-click line, X flip and Esc share one input state');
const rock=snapshot(base);rock.lava[20*32+20]=(1<<7)|(1<<8);
const moved=snapshot(base),source=Uint32Array.from({length:1024},(_,i)=>i);source[21*32+20]=20*32+20;
transportRock(rock,moved,source,false);assert.equal(moved.lava[21*32+20],rock.lava[20*32+20]);
moved.heights[21*32+20]=7;transportRock(rock,moved,source,true);assert.equal(moved.lava[21*32+20],(1<<5)|(1<<6));
pass('Slide transports volcanic strata; Lift moves strata vertically; no bit reaches the empty top layer');
const land=fixture('plain',128);const volcano=new ForceSession(land);
await complete(volcano,{verb:'erupt',settings:{...DEFAULTS.erupt,power:35,seed:6},intent:{origin:62*128+68}});
const hard=snapshot(volcano.map),soft=snapshot(hard);soft.lava.fill(0);
const cs={...DEFAULTS.carve,mode:'aim' as const,power:60,seed:18,wander:0,width:4,dry:true,defyGravity:true},ci={origin:72*128+28,end:72*128+112};
const h=new carve.CarveRun(hard,cs,ci),s=new carve.CarveRun(soft,cs,ci);
for(const r of [h,s])for(let k=0;k<1200&&!r.metrics.stable;k++)r.step();
const crossed=(r:carve.CarveRun)=>r.path.filter(p=>hard.lava[Math.round(p.y)*128+Math.round(p.x)]>0).length;
assert.notDeepEqual(h.path,s.path);assert(crossed(h)<crossed(s),JSON.stringify({hard:crossed(h),soft:crossed(s)}));
pass('The current Carve bends around Erupt’s hard lava, with fewer lava crossings');
const river=fixture('river',64),waterSession=new ForceSession(river);
await complete(waterSession,{verb:'erupt',settings:{...DEFAULTS.erupt,power:10},intent:{origin:48*64+48}});
const canonical=canonicalSettle(modelFor(waterSession.map));assert.deepEqual(waterSession.map.water.depth,canonical.depth);assert.deepEqual(waterSession.map.water.contamination,canonical.contamination);
pass('Live Erupt ends in byte-exact repository canonical water');
const bad=json(bundle);bad.operations[0].params.terrain[0][2]=255;
assert.throws(()=>new ForceSession(base).import(bad));const damaged=json(base);damaged.heights[0]=256;assert.throws(()=>storedMap(damaged));damaged.heights[0]=9;damaged.water.depth[0]=null;assert.throws(()=>storedMap(damaged));
pass('Invalid project numbers and corrupted result patches are rejected before typed-array narrowing');
mkdirSync('checks',{recursive:true});writeFileSync('checks/core.json',JSON.stringify({passed,interplay:{hardLavaStations:crossed(h),softLavaStations:crossed(s)}},null,2)+'\n');
