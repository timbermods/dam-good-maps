export const FORCE_ERRORS=["", "Invalid impact settings", "Strike on the map", "Drag across the map to aim", "Invalid eruption settings", "Choose land on the map", "Draw a fissure on the land", "Draw a longer fissure", "Invalid quake settings", "Draw a fault on the land", "No room for objects to move", "Invalid carve settings", "Invalid character settings", "Choose a different end point", "A drawn path needs an aimed carve, on the map", "Choose a point on the land showing", "The end point is uphill of the start", "At the map floor: no ground left to carve", "a glacier's power is 0 to 100", "a glacier's size is 4 to 64 tiles, or null (it follows Power)", "a glacier's seed is a whole number from 0 to 4294967295", "the glacier's head is off the map", "an aimed glacier needs its end on the map", "only an aimed glacier follows a drawn path", "a glacier's path is up to 128 tiles on the map", "a glacier's path moves on from each of its tiles to the next"];
// Binary64 values never cross a decimal serialization boundary. Objects have canonical key order;
// arrays retain their exact order. Typed arrays are represented by their entries in this protocol.
// Cold reconstruction can otherwise lose a NaN payload when Firefox reads a
// Float64Array element. Retain its original bytes for the fixture encoder while
// leaving ordinary JS fields/numbers intact. Production consumes the raw views.
const rawFloats=new WeakMap<object,Record<string,Uint8Array>>();
export function preserveRawFloats<T extends object>(value:T,view:Float64Array,fields:Record<string,number>):T {
 const bytes:Record<string,Uint8Array>={};for(const [key,index] of Object.entries(fields))if(Number.isNaN((value as any)[key]))bytes[key]=new Uint8Array(view.buffer,view.byteOffset+index*8,8).slice();
 if(Object.keys(bytes).length)rawFloats.set(value,bytes);return value;
}
export function encode(value:any,canonical=true):Uint8Array {
 let data=new Uint8Array(1024),view=new DataView(data.buffer),at=0;const encoder=new TextEncoder();
 const reserve=(n:number)=>{if(at+n>data.length){const next=new Uint8Array(Math.max(at+n,data.length*2));next.set(data);data=next;view=new DataView(data.buffer);}};
 const byte=(v:number)=>{reserve(1);data[at++]=v;};
 const u32=(v:number)=>{reserve(4);view.setUint32(at,v,true);at+=4;};
 const str=(v:string)=>{const bytes=encoder.encode(v);u32(bytes.length);reserve(bytes.length);data.set(bytes,at);at+=bytes.length;};
 function write(v:any){if(v===null){byte(0);}else if(typeof v==='boolean'){byte(v?2:1);}else if(typeof v==='number'){byte(3);reserve(8);view.setFloat64(at,v,true);at+=8;}else if(typeof v==='string'){byte(4);str(v);}else if(Array.isArray(v)||ArrayBuffer.isView(v)){byte(5);u32(v.length);for(const x of v)write(x);}else if(v&&typeof v==='object'){const keys=Object.keys(v).filter(k=>v[k]!==undefined);if(canonical)keys.sort();byte(6);u32(keys.length);for(const k of keys){str(k);const raw=rawFloats.get(v)?.[k];if(raw){byte(3);reserve(8);data.set(raw,at);at+=8;}else write(v[k]);}}else throw Error('Unsupported protocol type '+typeof v);}
 write(value);return data.slice(0,at);
}
export function decode(bytes:Uint8Array):any {let at=0;const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=()=>{const n=v.getUint32(at,true);at+=4;return n;},str=()=>{const n=u32(),s=new TextDecoder().decode(bytes.subarray(at,at+n));at+=n;return s;};function read():any {switch(bytes[at++]){case 0:return null;case 1:return false;case 2:return true;case 3:{const n=v.getFloat64(at,true);at+=8;return n;}case 4:return str();case 5:return Array.from({length:u32()},read);case 6:{const o:any={};for(let n=u32();n--;){const k=str();o[k]=read();}return o;}default:throw Error('Protocol tag');}}const out=read();if(at!==bytes.length)throw Error('Trailing output');return out;}
export async function bridge(wasm:BufferSource){
 const {instance}=await WebAssembly.instantiate(wasm,{dgm_bench:{now_ms:()=>performance.now()}}),e=instance.exports as any;
 const take=(call:(len:number)=>number)=>{const len=e.water_alloc(4);let out=0,n=0;try{out=call(len);n=new DataView(e.memory.buffer).getUint32(len,true);return new Uint8Array(e.memory.buffer,out,n).slice();}finally{if(out)e.water_dealloc(out,n);e.water_dealloc(len,4);}};
 const transfer=(input:Uint8Array,call:(p:number)=>any)=>{const p=e.water_alloc(input.length);new Uint8Array(e.memory.buffer,p,input.length).set(input);try{return call(p);}finally{e.water_dealloc(p,input.length);}};
 const run:any=(input:Uint8Array)=>transfer(input,p=>take(len=>e.forces_execute(p,input.length,len)));
 // Only initial fixture import and cold diagnostic pack use the generic codec.
 // The retained arena/handle and fresh views after calls follow rust-water/water.ts.
 // Memory can grow in any operation or another map's allocation: never cache views.
 const handle=(ptr:number,j:any)=>{const metadata=j.map.entities,plain=j.plainEntities??metadata,decoder=new TextDecoder(),encoder=new TextEncoder();let ids=metadata.map((v:any)=>v.id);const descriptor=e.forces_descriptor(ptr);let live=true;const check=()=>{if(!live)throw Error('Disposed force plan');};
  const view=(slot:number,Type:any)=>{check();const d=new Uint32Array(e.memory.buffer,descriptor,128);return new Type(e.memory.buffer,d[slot*2],d[slot*2+1]);};
  return {metadata:(slot:number,isPlain=false)=>(isPlain?plain:metadata)[slot],get ids(){const offsets=view(27,Uint32Array),bytes=view(28,Uint8Array);while(ids.length<offsets.length-1){const i=ids.length;ids.push(decoder.decode(bytes.subarray(offsets[i],offsets[i+1])));}return ids;},get computeMs(){check();if(!e.forces_compute_ms)throw Error("Use the bench-clock build for compute measurements");return e.forces_compute_ms(ptr);},plan:()=>{check();const error=e.forces_plan(ptr);if(error)throw Error(FORCE_ERRORS[error]);},reset:()=>{check();e.forces_reset(ptr);ids=metadata.map((v:any)=>v.id);},
   result(verb:string){if(verb==='footprint')return this.records(verb);return {map:this.map,objects:this.objects,regions:this.regions,records:this.records(verb),geometry:this.geometry,literalObjects:this.literalObjects,before:this.before,...(verb==='carve'?{closure:this.closure}:{})};},
   configure:(verb:string,settings:any,intent:any,margin=0,options:any={})=>{
    const opcode=['footprint','craterize','erupt','quake','carve','glaciate'].indexOf(verb);if(opcode<0)throw Error('Force not ported '+verb);
    let sourceBytes:Uint8Array|undefined,unleashedBytes:Uint8Array|undefined;if(verb==='carve'){sourceBytes=encoder.encode(options.sourceId??'');unleashedBytes=encoder.encode(options.unleashed??'');if(sourceBytes.length+unleashedBytes.length>view(62,Uint8Array).length)e.forces_reserve_command_bytes(ptr,sourceBytes.length+unleashedBytes.length);}
    const index=(v:string,list:string[])=>{const n=list.indexOf(v);if(n<0)throw Error('Invalid option '+v);return n;},path=intent.path??[],xy=view(17,Float64Array);
    if(path.length*2>xy.length)throw Error('Path exceeds arena capacity');
    const c=view(16,Float64Array);c.set([opcode,settings.power??NaN,settings.size??NaN,settings.seed??NaN,settings.floor??NaN,
     verb==='craterize'?index(settings.walls,['steep','terraced']):0,verb==='craterize'?index(settings.centre,['auto','bowl','peak','ring','flat']):0,
     +(settings.debris==='heavy'),+!!settings.rays,+(['aim','fissure','slide'].includes(settings.mode)),+(settings.shape==='steep'),
     verb==='erupt'?index(settings.summit,['auto','peak','crater','caldera']):0,+(settings.flows==='heavy'),+!!settings.ridges,+(settings.scarp==='stepped'),
     intent.origin??NaN,intent.end??NaN,intent.side??NaN,margin,path.length]);
    c[20]=+(intent.via!==undefined);c[21]=+(verb==='glaciate'&&options.finish===false);c[39]=0;
    if(verb==='carve') {const bytes=view(62,Uint8Array);bytes.set(sourceBytes!,0);bytes.set(unleashedBytes!,sourceBytes!.length);c.set([1,sourceBytes!.length,unleashedBytes!.length,+!!options.bad,+(options.sourceId!=null)+2*+(options.unleashed!=null)],39);c.set([settings.wander??35,settings.width??NaN,settings.depth??NaN,settings.banks??0,settings.riverDepth??NaN,+(settings.walls==='wide'),+!!settings.defyGravity,+!!settings.dry,+!!settings.layers],24);const via=intent.via??[],W=c[33];c[19]=via.length;if(via.length*2>xy.length)throw Error('Path exceeds arena capacity');for(let i=0;i<via.length;i++){xy[i*2]=via[i]%W;xy[i*2+1]=Math.floor(via[i]/W);}}
    if(verb==='glaciate'){c.set([+settings.meltwater,index(settings.benches??'some',['none','some','many']),index(settings.steps??'some',['few','some','many']),+(settings.tarn??true),+(settings.scree??true)],34);const via=intent.via??[],W=c[33];c[19]=via.length;if(via.length*2>xy.length)throw Error('Path exceeds arena capacity');for(let i=0;i<via.length;i++){xy[i*2]=via[i]%W;xy[i*2+1]=Math.floor(via[i]/W);}}
    for(let i=0;i<path.length;i++){xy[i*2]=path[i].x;xy[i*2+1]=path[i].y;}
   },
   get objects(){return {x:view(19,Float64Array),y:view(20,Float64Array),z:view(21,Float64Array),flags:view(22,Uint32Array),order:view(23,Uint32Array),fallen:view(24,Float64Array),idOffsets:view(27,Uint32Array),idBytes:view(28,Uint8Array),sourceStrength:view(29,Float64Array),sourceKind:view(30,Uint8Array)};},
   get before(){return {heights:view(55,Uint8Array),lava:view(56,Uint32Array),depth:view(57,Float64Array),contamination:view(58,Float64Array),rock:view(59,Float64Array),objects:view(60,Float64Array),fallen:view(61,Float64Array)};},
   get closure(){return {heights:view(46,Uint8Array),lava:view(47,Uint32Array),depth:view(48,Float64Array),contamination:view(49,Float64Array),rock:view(50,Float64Array),objects:view(51,Float64Array),fallen:view(52,Float64Array)};},
   get literalObjects(){return view(53,Float64Array);},
   get raw(){return {heights:view(32,Uint8Array),lava:view(33,Uint32Array),depth:view(34,Float64Array),contamination:view(35,Float64Array),rock:view(36,Float64Array),objects:view(37,Float64Array),fallen:view(38,Float64Array)};},
   get geometry(){return view(18,Float64Array);},
   get map(){return {heights:view(0,Uint8Array),lava:view(1,Uint32Array),water:{depth:view(2,Float64Array),contamination:view(3,Float64Array)},rockLayers:view(4,Float64Array),keep:view(5,Uint8Array)};},
   get regions(){return {tiles:view(6,Uint32Array),heights:view(7,Uint8Array),rockTiles:view(8,Uint32Array),bits:view(9,Uint32Array)};},
   records:(verb:string)=>verb==='carve'?{changeOffsets:view(10,Uint32Array),changes:view(11,Int32Array),metrics:view(12,Float64Array),heads:view(13,Float64Array),path:view(14,Float64Array),lengths:view(15,Uint32Array),headOffsets:view(25,Uint32Array),pathOffsets:view(26,Uint32Array),rawOffsets:view(39,Uint32Array),rawChanges:view(40,Int32Array),stepMetrics:view(41,Float64Array),stepObjects:view(45,Float64Array),stepObjectChanges:view(54,Float64Array)}:verb==='glaciate'?{arrival:view(10,Float32Array),mask:view(11,Uint8Array),metrics:view(12,Float64Array),floor:view(13,Uint8Array),nearest:view(14,Int32Array),stream:view(15,Uint8Array),fan:view(25,Uint8Array)}:verb==='footprint'?{offsets:view(10,Uint32Array),tiles:view(11,Uint32Array)}:verb==='quake'?{arrival:view(10,Float32Array),stats:view(12,Float64Array),dx:view(13,Int16Array),dy:view(14,Int16Array),source:view(15,Uint32Array),extras:view(42,Uint32Array),finalDepth:view(43,Float64Array),finalContamination:view(44,Float64Array)}:verb==='erupt'?{flows:view(10,Float32Array),keep:view(11,Uint8Array),stats:view(12,Float64Array),heat:view(13,Uint8Array)}:{arrival:view(10,Float32Array),keep:view(11,Uint8Array),stats:view(12,Float64Array)},
   checkpoint:()=>{check();e.forces_checkpoint(ptr);},
   pack:()=>{check();return take(len=>e.forces_pack(ptr,len));},dispose:()=>{if(live){e.forces_free(ptr);live=false;}}};};
 // Retained-map entry point: numerical arrays never enter the generic codec,
 // including during map creation. Metadata is imported once per map.
 run.create=(j:any)=>{
  const metadata={...j,map:{...j.map,_plainEntities:j.plainEntities??j.map.entities,heights:[],lava:[],rockLayers:[],water:{depth:[],contamination:[]}},keep:[]};
  const bytes=encode(metadata,false),task=handle(transfer(bytes,p=>e.forces_create(p,bytes.length)),j);
  try{const m=task.map,n=j.map.W*j.map.H;
   for(const a of [j.map.heights,j.map.lava,j.map.water.depth,j.map.water.contamination,j.keep])if(a.length!==n)throw Error('Invalid numeric map shape');
   m.heights.set(j.map.heights);m.lava.set(j.map.lava);m.water.depth.set(j.map.water.depth);m.water.contamination.set(j.map.water.contamination);m.rockLayers.set(j.map.rockLayers);m.keep.set(j.keep);task.checkpoint();return task;
  }catch(error){task.dispose();throw error;}
 };
 run.prepare=(input:Uint8Array)=>handle(transfer(input,p=>e.forces_prepare(p,input.length)),decode(input)); // cold legacy fixture reader
 return run;
}
