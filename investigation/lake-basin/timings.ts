// Observe product calls, preserving their arguments and results.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
let events: {name:string;wallMs:number;cpuMs:number;input?:string}[]=[];
let destination:string|undefined;
const save=()=>{if(destination)writeFileSync(destination,JSON.stringify(events,null,2));};
export function mark(name:string):void { events.push({name,wallMs:0,cpuMs:0});save(); }
export function install(out:string):void {
  destination=out;events=[];
  for(const [file,names] of [
    ['land/field',['makeField']],['land/levels',['snapLevels','carveOutlets','widenOutlets','naturalRamps']],
    ['land/hydro',['planHydro']],['land/minePads',['mineRoom','minePads','roomMap']],
    ['land/hazards',['planBadwater']],['features/build',['buildMap']],
    ['sim/drought',['droughtStorage']],['gen/settler',['pickStart']],
  ] as const) {
    const mod=require('../../src/core/'+file);
    for(const name of names) {
      const original=mod[name];
      mod[name]=(...args:any[])=>{
        // All inputs droughtStorage actually reads, hashed before its timer. No inputs are changed.
        let input:string|undefined;
        if(name==='droughtStorage') {
          const [m,depth,days]=args;const hash=createHash('sha256');
          hash.update(JSON.stringify([m.W,m.H,days,m.emitters]));
          for(const a of [m.floor,m.dam,depth])if(a) {
            const values=Float64Array.from(a as ArrayLike<number>);
            hash.update(Buffer.from(values.buffer));
          } else hash.update('null');
          input=hash.digest('hex');
        }
        const wall=performance.now(),cpu=process.cpuUsage();const result=original(...args);
        const spent=process.cpuUsage(cpu);
        events.push({name,wallMs:performance.now()-wall,cpuMs:(spent.user+spent.system)/1000,input});
        save();return result;
      };
    }
  }
}
