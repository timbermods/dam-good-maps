import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from '../demo/maps';
import {snapshot,normalize} from '../core/map';
import * as oldCarve from '../local/baseline/carve/engine';
import * as oldCrater from '../local/baseline/craterize/engine';
import * as oldErupt from '../local/baseline/erupt/engine';
import * as oldQuake from '../local/baseline/quake/engine';
import {carve,crater,erupt,quake} from '../verbs';
const results:any[]=[];
const digest=(m:any)=>createHash('sha256').update(m.heights).update(JSON.stringify(m.entities)).update(JSON.stringify(m.fallen??[])).digest('hex');
for(const seed of [0,1,42])for(const mode of ['lift','slide'] as const)for(const scarp of ['sheer','stepped'] as const){
 const m=fixture('slide',64),s={...quake.DEFAULTS,seed,mode,scarp},i={path:[{x:0,y:38},{x:63,y:38}],side:seed%2?1 as const:-1 as const};
 const a=oldQuake.quake(snapshot(m),s,i),b=quake.quake(snapshot(m),s,i);assert.deepEqual(b.map,a.map);assert.deepEqual(b.source,a.source);results.push({verb:'quake',mode,scarp,seed,sha256:digest(b.map)});
}
for(const seed of [0,1,42])for(const centre of ['bowl','peak','ring','flat'] as const){
 const m=fixture('plain',64),s={...crater.DEFAULTS,seed,centre,power:50,size:28,rays:seed>0},i={origin:38*64+40};
 const a=oldCrater.impact(snapshot(m),s,i),b=crater.impact(snapshot(m),s,i);assert.deepEqual(b.map,a.map);results.push({verb:'craterize',centre,seed,sha256:digest(b.map)});
}
for(const seed of [0,1,42])for(const mode of ['vent','fissure'] as const)for(const shape of ['steep','broad'] as const){
 const m=fixture('plain',64),s={...erupt.DEFAULTS,seed,mode,shape,power:45},i={origin:40*64+35,path:[{x:30,y:40},{x:50,y:42}]};
 const a=oldErupt.erupt(snapshot(m),s,i),b=erupt.erupt(snapshot(m),s,i);assert.deepEqual(b.map,a.map);results.push({verb:'erupt',mode,shape,seed,sha256:digest(b.map)});
}
for(const seed of [0,1,42])for(const wander of [0,35,100]){
 const m=fixture('plain',64),s={...carve.DEFAULTS,mode:'aim' as const,dry:true,defyGravity:true,width:5,power:75,wander,seed},i={origin:55*64+40,end:3*64+40};
 const a=new oldCarve.CarveRun(snapshot(m),s,i),b=new carve.CarveRun(snapshot(m),s,i);
 for(let k=0;k<1400&&!a.metrics.stable;k++){a.step();b.step();assert.deepEqual(b.map,a.map);assert.deepEqual(b.path,a.path);}
 assert(a.metrics.stable);assert.deepEqual(b.metrics,a.metrics);results.push({verb:'carve',wander,seed,sha256:digest(b.map)});
}
mkdirSync('checks',{recursive:true});writeFileSync('checks/parity.json',JSON.stringify({cases:results.length,comparison:'Full terrain, entities, fallen state, water and rock; Carve also every step/path/metric',results},null,2)+'\n');
console.log('PASS '+results.length+' pinned prototype cases are byte-exact after extraction');
