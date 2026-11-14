import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {adopt,files,dir,root} from './proposal.mjs';
const source=readFileSync(resolve(root,files[0]),'utf8');
const moduleOf=async s=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
export const before=await moduleOf(source),after=await moduleOf(adopt(files[0],source));
let seed=4242;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function view(n){const tile=Int32Array.from({length:n},()=>Math.floor(random()*128));return {count:n,tile,floor:Float32Array.from(tile,()=>random()*22),depth:Float32Array.from(tile,()=>random()*8),contamination:Float32Array.from(tile,()=>random())};}
function equal(a,b){assert.equal(a.count,b.count);for(const k of ['tile','floor','depth','contamination'])assert.deepEqual(new Uint8Array(a[k].buffer),new Uint8Array(b[k].buffer),k);}
for(let n=0;n<400;n++){const a=view(n%97),b=view(n%101);for(const t of [0,1/17,0.5,16/17,1])equal(before.blendWater(a,b,t),after.blendWater(a,b,t));}
globalThis.window={setTimeout:()=>1,clearTimeout:()=>{}};
const host={show:()=>{},changed:()=>{}};
const a=view(100),b=view(120),p=new before.WaterPlayer(host),q=new after.WaterPlayer(host);
p.begin({water:a,done:0});q.begin({water:a,done:0});p.push({water:b,done:1,final:()=>{}});q.push({water:b,done:1,final:()=>{}});
assert.equal(p.frames.length,q.frames.length);
assert.equal(typeof Object.getOwnPropertyDescriptor(q.frames[1],'water').get,'function');
for(let n=0;n<p.frames.length;n++)equal(p.frames[n].water,q.frames[n].water);
let called=0;q.begin({water:a,done:0});q.push({water:b,done:1,final:()=>called++});q.skip();assert.equal(called,1);assert.equal(q.playing,false);assert.equal(q.canReplay,true);
const savedNow=performance.now,savedClear=globalThis.clearTimeout;
try {
  for(const speed of ['slower','normal','faster','instant']){
    const play=mod=>{
      let now=0,id=0,callbacks=0;const timers=new Map(),shown=[];
      Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
      globalThis.clearTimeout=n=>timers.delete(n);
      globalThis.window={setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;}};
      const player=new mod.WaterPlayer({show:f=>shown.push(f),changed:()=>{}});
      const drain=()=>{let guard=0;while(timers.size){assert(++guard<1000);const [key,t]=[...timers].sort((x,y)=>x[1].at-y[1].at)[0];timers.delete(key);now=t.at;t.fn();}};
      player.setSpeed(speed);player.begin({water:a,done:0});player.pause(true);
      player.push({water:b,done:1,final:()=>callbacks++});assert.equal(timers.size,0);
      player.pause(false);drain();assert.equal(callbacks,1);assert.equal(player.canReplay,true);
      player.replay();drain();assert.equal(callbacks,2);
      player.replay();player.skip();assert.equal(callbacks,3);assert.equal(timers.size,0);
      player.clear();assert.equal(player.hasJourney,false);return {shown,callbacks};
    };
    const left=play(before),right=play(after);assert.equal(left.shown.length,right.shown.length);
    for(let i=0;i<left.shown.length;i++){equal(left.shown[i].water,right.shown[i].water);assert.equal(left.shown[i].done,right.shown[i].done);}
  }
}finally{Object.defineProperty(performance,'now',{value:savedNow,configurable:true});globalThis.clearTimeout=savedClear;globalThis.window={setTimeout:()=>1,clearTimeout:()=>{}};}
let kernels=0;
for(const path of ['src/core/sim','src/core/forces','src/core/format'])for(const name of readdirSync(resolve(root,path),{recursive:true}).filter(x=>String(x).endsWith('.ts'))){const file=path+'/'+String(name).replaceAll('\\','/'),s=readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n');assert.equal(adopt(file,s),s,file);kernels++;}
const schema=JSON.parse(adopt(files[3],readFileSync(resolve(root,files[3]),'utf8')));
assert(!JSON.stringify(schema).includes('65535'));
console.log(`2,000 byte comparisons; play, pause, replay and skip at four speeds; ${kernels} unchanged simulation/force/format modules passed.`);
