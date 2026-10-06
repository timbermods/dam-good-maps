import {DEFAULTS as CARVE} from '../../src/core/forces/carve/run';
import {CRATER_DEFAULTS as CRATER} from '../../src/core/forces/craterize';
import {ERUPT_DEFAULTS as ERUPT,ERUPT_SIZE_MAX} from '../../src/core/forces/erupt';
import {QUAKE_DEFAULTS as QUAKE} from '../../src/core/forces/quake';
import {GLACIATE_DEFAULTS as GLACIATE,GLACIATE_SIZE_MAX} from '../../src/core/forces/glaciate/model';
import {RIFT_DEFAULTS as RIFT} from '../../src/core/forces/rift';
import {makeSpec,type ThemeId} from '../../src/core/spec/mapspec';
import {runGenerate} from '../../src/worker/api';
import * as ed from '../../src/worker/session';
import {MapSession} from '../../src/core/doc/session';
import {decodeProject} from '../../src/core/doc/document';
import {hypot} from '../../src/core/math/portable';
export interface Input {theme:string; bytes:number[]; requests:ed.ForceRequest[]}
let serial=0;
Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> '00000000-0000-4000-8000-'+String(++serial).padStart(12,'0')});
export async function prepare(theme:ThemeId):Promise<Input>{
 const W=256;serial=0;await runGenerate(makeSpec({seed:3,theme,size:{x:W,y:W}}));ed.refine();
 const bytes=ed.project().bytes,s=MapSession.open(decodeProject(bytes)),st=s.built.start!;
 let at:[number,number]=[64,64],best=-1;
 for(let y=8;y<W-8;y+=2)for(let x=8;x<W-8;x+=2){
 if(hypot(x-st.x,y-st.y)<W/5||s.built.water[y*W+x]>0)continue;
 if(s.built.heights[y*W+x]>best){best=s.built.heights[y*W+x];at=[x,y];}
 }
 const mid:[number,number]=[128,128],path=[{x:4,y:W*.3},{x:W-5,y:W*.7}];
 return {theme,bytes:Array.from(bytes),requests:[
 {verb:'carve',settings:{...CARVE,power:100,width:24},origin:at,cut:null},
 {verb:'craterize',settings:{...CRATER,power:100,size:180},origin:mid,cut:null},
 {verb:'erupt',settings:{...ERUPT,power:100,size:ERUPT_SIZE_MAX,flows:'heavy'},origin:mid,cut:null},
 {verb:'quake',settings:{...QUAKE,mode:'slide',power:100},path,side:1,cut:null},
 {verb:'glaciate',settings:{...GLACIATE,power:100,size:GLACIATE_SIZE_MAX},origin:at,cut:null},
 {verb:'rift',settings:{...RIFT,power:100,size:64},path,cut:null},
 ]};
}
export function load(input:Input){ed.closeSession();serial=0;ed.setAutoWater(false);ed.openProject(Uint8Array.from(input.bytes));}
export function run(req:ed.ForceRequest){
 serial=0;
 const begin=performance.now(),r=ed.forceStart(req),started=performance.now();
 if(!r.ok)throw Error(r.errors.join(';'));
 let frames=0,slowest=0,first=0;
 for(;;){const t=performance.now(),f=ed.forceAdvance(1),dt=performance.now()-t;
 if(frames===0)first=dt;slowest=Math.max(slowest,dt);frames++;if(!f||f.done)break;if(frames>5000)throw Error('unfinished');}
 const played=performance.now(),kept=ed.forceStop(),end=performance.now();
 if(!kept.kept)throw Error('not kept '+kept.errors);
 return {force:req.verb,startMs:started-begin,firstStepMs:first,playMs:played-started,keepMs:end-played,totalMs:end-begin,frames,slowestStepMs:slowest};
}
export function result(){
 const s=MapSession.open(decodeProject(ed.project().bytes)),b=s.built;
 return {heights:Array.from(b.heights),water:Array.from(b.water),contamination:Array.from(b.contamination),entities:b.entities,state:s.state.sculpts};
}