import type { WaterModel, WaterState, WaterSimOptions, SettleOptions } from "./local/reference-water";
export type Command = { ticks: number; scale?: number; emitters?: WaterModel["emitters"]; floors?: [number,number][]; capture?:boolean } | { settle: SettleOptions };
class Writer {
  data=new Uint8Array(1024);at=0;
  reserve(n:number){if(this.at+n>this.data.length){const next=new Uint8Array(Math.max(this.at+n,this.data.length*2));next.set(this.data);this.data=next;}}
  u32(v:number) {this.reserve(4);new DataView(this.data.buffer).setUint32(this.at,v,true);this.at+=4;}
  f64(v:number) {this.reserve(8);new DataView(this.data.buffer).setFloat64(this.at,v,true);this.at+=8;}
  append(p:Uint8Array){this.reserve(p.length);this.data.set(p,this.at);this.at+=p.length;}
  array(a:ArrayLike<number>) { for(let i=0;i<a.length;i++)this.f64(a[i]); }
  bytes(){return this.data.slice(0,this.at);}
}
export function encodeModel(m:WaterModel,initial?:WaterState,opts:WaterSimOptions={},out?:Float64Array):Uint8Array {
  const b=new Writer(),n=m.W*m.H,game=(opts.rules??"game")==="game";
  b.u32(0x31575244);b.u32(m.W);b.u32(m.H);b.u32((game?1:0)|((opts.edgeSpill??game)?2:0)|(m.dam?4:0));b.u32(m.emitters.length);
  b.array(m.floor);if(m.dam)b.array(m.dam);b.array(initial?.depth??new Float64Array(n));b.array(initial?.contamination??new Float64Array(n));b.array(out??new Float64Array(4*n));
  for(const e of m.emitters){b.u32(e.cells.length);for(const i of e.cells)b.u32(i);b.f64(e.strength);b.f64(e.contamination);b.u32(e.depthLimit?.anchor??0xffffffff);b.f64(e.depthLimit?.off??0);b.f64(e.depthLimit?.on??0);}
  return b.bytes();
}
export function encodeJob(m:WaterModel,initial:WaterState|undefined,opts:WaterSimOptions,commands:Command[],out?:Float64Array):Uint8Array {
  const model=encodeModel(m,initial,opts,out),b=new Writer();b.u32(commands.length);
  for(const cmd of commands){if("settle" in cmd){const o=cmd.settle;b.u32(1);b.f64(o.maxDays??6);b.u32(o.checkEvery??128);b.f64(o.tol??.005);b.f64(o.movedShare??.005);b.u32(o.untilSteady?1:0);b.u32(o.sealed?.length??0);for(const i of o.sealed??[])b.u32(i);}
    else{b.u32(cmd.capture===false?2:0);b.u32(cmd.ticks);b.f64(cmd.scale??1);for(const e of cmd.emitters??m.emitters){b.f64(e.strength);b.f64(e.contamination);b.f64(e.depthLimit?.off??0);b.f64(e.depthLimit?.on??0);}b.u32(cmd.floors?.length??0);for(const [i,v] of cmd.floors??[]){b.u32(i);b.f64(v);}}}
  const rest=b.bytes(),all=new Uint8Array(model.length+rest.length);all.set(model);all.set(rest,model.length);return all;
}
export function snapshot(sim:any,result:any=null):Uint8Array {
  const b=new Writer();b.u32(sim.ticks);b.u32(result?.settled?1:0);b.u32(result?.steadyTicks??0xffffffff);b.u32(sim.N);b.f64(sim.volume());b.array(sim.D);b.array(sim.C);b.array(sim.Dold);b.array(sim.out);
  const head=b.bytes(),sat=sim.saturation(),seep=sim.seepOn as Uint8Array,all=new Uint8Array(head.length+sat.length+seep.length);all.set(head);all.set(sat,head.length);all.set(seep,head.length+sat.length);return all;
}
export function packSnapshots(parts:Uint8Array[]):Uint8Array {const b=new Writer();b.u32(parts.length);for(const p of parts){b.u32(p.length);b.append(p);}return b.bytes();}
export function decodeJob(data:Uint8Array){let at=0;const view=new DataView(data.buffer,data.byteOffset,data.byteLength),u32=()=>{const v=view.getUint32(at,true);at+=4;return v;},f64=()=>{const v=view.getFloat64(at,true);at+=8;return v;},array=(n:number)=>Float64Array.from({length:n},f64);
  if(u32()!==0x31575244)throw Error('Protocol magic');const W=u32(),H=u32(),flags=u32(),ne=u32(),N=W*H;
  const floor=array(N),dam=flags&4?array(N):null,initial={depth:array(N),contamination:array(N)},out=array(4*N),emitters:WaterModel['emitters']=[];
  for(let e=0;e<ne;e++){const nc=u32(),cells=Array.from({length:nc},u32),strength=f64(),contamination=f64(),anchor=u32(),off=f64(),on=f64();emitters.push({cells,strength,contamination,...(anchor===0xffffffff?{}:{depthLimit:{anchor,off,on}})});}
  const model:WaterModel={W,H,floor,dam,emitters},opts:WaterSimOptions={rules:flags&1?'game':'port',edgeSpill:!!(flags&2)},nc=u32(),commands:Command[]=[];
  for(let c=0;c<nc;c++){const op=u32();if(op===1){const maxDays=f64(),checkEvery=u32(),tol=f64(),movedShare=f64(),untilSteady=!!u32(),ns=u32(),sealed=Array.from({length:ns},u32);commands.push({settle:{maxDays,checkEvery,tol,movedShare,untilSteady,sealed}});}
  else{if(op!==0&&op!==2)throw Error('Protocol opcode');const ticks=u32(),scale=f64(),forcing=structuredClone(emitters);for(const e of forcing){e.strength=f64();e.contamination=f64();const off=f64(),on=f64();if(e.depthLimit)Object.assign(e.depthLimit,{off,on});}const nf=u32(),floors=Array.from({length:nf},()=>[u32(),f64()] as [number,number]);commands.push({ticks,scale,emitters:forcing,floors,capture:op===0});}}
  if(at!==data.length)throw Error('Trailing input bytes');return {model,initial,opts,out,commands};
}
