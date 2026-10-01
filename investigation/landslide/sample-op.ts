import {mkdirSync,writeFileSync} from 'node:fs';
import {fullMap} from '../../src/core/forces/force';
import {plan,DEFAULTS} from './landslide';
const W=16,H=16,m=fullMap({W,H,maxHeight:22,heights:Uint8Array.from({length:W*H},(_,i)=>Math.max(1,15-Math.floor(i/W))),entities:[],water:{depth:new Float64Array(W*H),contamination:new Float64Array(W*H)}});
const p=plan(m,{...DEFAULTS,power:70,size:10},{path:[{x:8,y:2},{x:8,y:12}]});
mkdirSync('samples',{recursive:true});writeFileSync('samples/tiny-operation.json',JSON.stringify({input:'16×16 dry downhill slope, no objects',operation:p.operation,volume:p.stats.removed},null,2)+'\n');
console.log('small literal operation',p.operation.tiles.length,'tiles',p.stats.removed,'blocks');
