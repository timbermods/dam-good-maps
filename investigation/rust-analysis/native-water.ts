import {WaterSim as TypeScriptSim,type WaterModel,type WaterState,type WaterSimOptions} from './local/reference-water';
import {encodeModel} from './local/protocol';
export * from './local/reference-water';
declare const Buffer:any;
const addon=(globalThis as any).__raNative;
if(!addon)throw Error('Native addon must be installed before importing native generation API');
export class WaterSim extends TypeScriptSim {
 readonly backend='native';private handle:any;private disposed=false;
 constructor(m:WaterModel,initial?:WaterState,opts:WaterSimOptions={}){super(m,initial,opts);this.handle=addon.waterNew(Buffer.from(encodeModel(m,initial,opts)));}
 override run(ticks:number,scale=1):this{if(this.disposed)throw Error('disposed');if(!(ticks>0))return this;
 const values=new Float64Array(2+this.N+(this.dam?this.N:0)+4*this.N+5*this.emitters.length);let at=0;values[at++]=Math.ceil(ticks);values[at++]=scale;values.set(this.F,at);at+=this.N;if(this.dam){values.set(this.dam,at);at+=this.N;}values.set(this.out,at);at+=4*this.N;
 for(const e of this.emitters){values.set([e.strength,e.contamination,e.depthLimit?.anchor??-1,e.depthLimit?.off??0,e.depthLimit?.on??0],at);at+=5;}
 const bytes=addon.waterRun(this.handle,Buffer.from(values.buffer));const backing=bytes.byteOffset%8?new Uint8Array(bytes).buffer:bytes.buffer,byteOffset=bytes.byteOffset%8?0:bytes.byteOffset;const view=new Float64Array(backing,byteOffset,7*this.N);let offset=0;for(const a of [this.D,this.C,this.Dold,this.out]){a.set(view.subarray(offset,offset+a.length));offset+=a.length;}
 const seep=(this as any).seepOn as Uint8Array;seep.set(bytes.subarray(8*offset));this.ticks+=Math.ceil(ticks);return this;}
 override saturation():Uint8Array{if(this.disposed)throw Error('disposed');return Uint8Array.from(addon.waterSat(this.handle));}
 dispose(){if(!this.disposed){this.disposed=true;addon.waterDispose(this.handle);}}
}
