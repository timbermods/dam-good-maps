// Exact execution checkpoints. Based on startup's stored-build graph, with bounded records,
// shared ArrayBuffer/view identity, and external (disposable) force-result references.
import {Gzip,Gunzip,gzipSync} from "fflate";
import {JsonFloat} from "../format/json";
import {toBase64,fromBase64} from "../format/base64";
import {derivedResultKey,ResultStore,type ColdResults} from "./resultStore";

const types={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
const utf8=new TextEncoder(),MAX=16384,TEXT=8192;
export const BLOB_KEY=2**43;
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export type BlobIndex={key:number;bytes:number;rawBytes:number;crc:number;dependencies?:number[];results?:number[]};
/** Exact deduplication: CRC is only an index; matching bytes are compared before sharing.
 * Objects are weakly indexed, so this dictionary does not retain historical map buffers. */
export class StateBank {
 private objects=new WeakMap<object,number>();private buckets=new Map<string,number[]>();private items=new Map<number,BlobIndex>();private next=BLOB_KEY;
 readonly external=new WeakMap<object,{key:number;node:number;instance:string}>();
 nextInstance:number;
 constructor(readonly cold:ColdResults,index:BlobIndex[]=[],nextInstance=1,nextKey=BLOB_KEY){this.next=Math.max(BLOB_KEY,nextKey);this.nextInstance=nextInstance;for(const item of index){if(!Number.isSafeInteger(item.rawBytes)||item.rawBytes<0||item.rawBytes>128*1024*1024||!Number.isSafeInteger(item.key)||item.key<BLOB_KEY||this.items.has(item.key))throw Error('invalid state blob bounds');this.items.set(item.key,item);const id=item.rawBytes+':'+item.crc;this.buckets.set(id,[...(this.buckets.get(id)??[]),item.key]);this.next=Math.max(this.next,item.key+1);}}
 keep(bytes:Uint8Array,owner?:object):number {
  if(bytes.length>128*1024*1024)throw Error('state blob exceeds capacity');
  const known=owner&&this.objects.get(owner);if(known!==undefined)return known;let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
  const id=bytes.length+':'+crc;for(const key of this.buckets.get(id)??[]){const old=this.read(key);if(old.length===bytes.length&&old.every((v,i)=>v===bytes[i])){if(owner)this.objects.set(owner,key);return key;}}
  const key=this.next++,compressed=gzipSync(bytes,{level:6,mtime:0});this.cold.put(key,compressed);this.items.set(key,{key,bytes:compressed.length,rawBytes:bytes.length,crc});this.buckets.set(id,[...(this.buckets.get(id)??[]),key]);if(owner)this.objects.set(owner,key);return key;
 }
 read(key:number):Uint8Array {const item=this.items.get(key);if(!item)throw Error('missing state blob');const bytes=new Uint8Array(item.rawBytes);let written=0;
  const gzip=this.cold.get(key),inflate=new Gunzip(b=>{if(written+b.length>bytes.length)throw Error('state blob length exceeds bound');bytes.set(b,written);written+=b.length;});
  for(let at=0;at<gzip.length;at+=4096)inflate.push(gzip.subarray(at,at+4096),false);inflate.push(new Uint8Array(),true);if(written!==bytes.length)throw Error('state blob length differs');return bytes;}
 share(root:object):void {
  if(this.external.has(root))return;let nodes:Map<object,number>|undefined;
  const packed=packState(root,this,seen=>nodes=seen),key=this.keep(packed.bytes),item=this.items.get(key)!;
  item.dependencies=packed.blobs;item.results=packed.results;
  const instance='g1:'+this.nextInstance++;
  for(const [object,node]of nodes!)if(!this.external.has(object))this.external.set(object,{key,node,instance});
 }
 index(keys:Iterable<number>):BlobIndex[]{const seen=new Set<number>();const visit=(key:number)=>{if(seen.has(key))return;seen.add(key);const item=this.items.get(key);if(!item)throw Error('missing state blob index');for(const dep of item.dependencies??[])visit(dep);};for(const key of keys)visit(key);return [...seen].map(key=>this.items.get(key)!);}
 results(key:number):number[]{return this.items.get(key)?.results??[];}
}
export type PackedState={bytes:Uint8Array;results:number[];blobs:number[]};
/** Each JSON record is bounded; neither the execution graph nor a large array is stringified. */
export function packState(root:object,bank?:StateBank,register?:(seen:Map<object,number>)=>void):PackedState {
 const seen=new Map<object,number>(),queue:object[]=[],strings=new Map<string,number>(),textNodes=new Set<object>(),resultKeys=new Set<number>(),blobKeys=new Set<number>(),out:Uint8Array[]=[];
 const gzip=new Gzip({level:6,mtime:0},b=>out.push(b));let pending='';
 const emit=(r:unknown)=>{const text=JSON.stringify(r);if(text.length>65536)throw Error("checkpoint record exceeds bound");if(pending.length+text.length>32768){gzip.push(utf8.encode(pending),false);pending='';}pending+=text+'\n';};
 const value=(v:any):any=>{
  if(v===undefined)return {u:1};if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return {n:Object.is(v,-0)?'-0':String(v)};
  if(typeof v==='string'&&v.length>TEXT){let id=strings.get(v);if(id===undefined){id=queue.length;strings.set(v,id);const box={text:v};textNodes.add(box);queue.push(box);}return {r:id};}
  if(!v||typeof v!=='object')return v;
  let id=seen.get(v);if(id===undefined){id=queue.length;seen.set(v,id);queue.push(v);}return {r:id};
 };
 value(root);
 for(let id=0;id<queue.length;id++){
  const v:any=queue[id],key=derivedResultKey(v);
  const external=bank?.external.get(v);if(external){blobKeys.add(external.key);for(const result of bank!.results(external.key))resultKeys.add(result);emit([id,'ExternalObject',external.key,external.node,external.instance]);continue;}
  if(textNodes.has(v)){if(bank){const units=Uint16Array.from({length:v.text.length},(_,i)=>v.text.charCodeAt(i)),key=bank.keep(new Uint8Array(units.buffer));blobKeys.add(key);emit([id,'ExternalString',key,'u16']);}else{emit([id,'String']);for(let at=0;at<v.text.length;at+=TEXT)emit([id,'Entries',[v.text.slice(at,at+TEXT)]]);}continue;}
  if(key!==undefined){const seq=Number(key.split(':').at(-1));resultKeys.add(seq);
   const entries=Object.entries(Object.getOwnPropertyDescriptors(v)).filter(([,d])=>'value'in d).map(([k,d])=>[k,value(d.value)]);
   const heavy=Object.entries(Object.getOwnPropertyDescriptors(v)).filter(([,d])=>d.get).map(([k])=>k);
   emit([id,'Derived',seq,entries,heavy]);continue;
  }
  if(v instanceof JsonFloat){emit([id,'Float',value(v.value),value(v.raw)]);continue;}
  if(v instanceof ArrayBuffer){if(bank){const key=bank.keep(new Uint8Array(v),v);blobKeys.add(key);emit([id,'ExternalBuffer',key]);}else{emit([id,'Buffer',v.byteLength]);const raw=new Uint8Array(v);for(let at=0;at<raw.length;at+=MAX)emit([id,'Bytes',at,toBase64(raw.subarray(at,at+MAX))]);}continue;}
  if(ArrayBuffer.isView(v)){if(!(v.constructor.name in types))throw Error('unsupported checkpoint view');emit([id,'View',v.constructor.name,value(v.buffer),v.byteOffset,(v as any).length]);continue;}
  const kind=v instanceof Map?'Map':v instanceof Set?'Set':Array.isArray(v)?'Array':'Object';
  if(kind==='Object'&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('unsupported checkpoint class: '+v.constructor.name);
  emit([id,kind]);
  const entries=kind==='Map'?[...v].map(([k,x])=>[value(k),value(x)]):kind==='Set'?[...v].map(value):kind==='Array'?v.map(value):Object.entries(v).map(([k,x])=>[k,value(x)]);
  for(let at=0;at<entries.length;at+=64){let batch=entries.slice(at,at+64);
   // Split records containing long scalar strings as independent string nodes.
   for(let i=0;i<batch.length;i++)if(JSON.stringify(batch[i]).length>48000)throw Error('oversized checkpoint scalar');
   while(batch.length&&JSON.stringify([id,'Entries',batch]).length>60000){emit([id,'Entries',[batch.shift()]]);}
   if(batch.length)emit([id,'Entries',batch]);
  }
 }
 gzip.push(utf8.encode(pending),true);const size=out.reduce((n,b)=>n+b.length,0),bytes=new Uint8Array(size);let at=0;for(const b of out){bytes.set(b,at);at+=b.length;}register?.(seen);return {bytes,results:[...resultKeys],blobs:[...blobKeys]};
}

export function unpackState(bytes:Uint8Array,store:ResultStore,bank?:StateBank,components=new Map<string,any[]>(),allNodes=false):any {
 const nodes:any[]=[],values:any[]=[],decoder=new TextDecoder('utf-8',{fatal:true});let pending='',inflated=0;
 const record=(r:any[])=>{const [id,type,...args]=r;if(!Number.isSafeInteger(id)||id<0||id>1000000)throw Error('bad checkpoint node');
  if(type==='Entries'){if(!nodes[id])throw Error('checkpoint entries precede node');nodes[id].entries.push(...args[0]);return;}
  if(type==='Bytes'){const b=fromBase64(args[1]),v=values[id];if(!(v instanceof ArrayBuffer)||args[0]<0||args[0]+b.length>v.byteLength)throw Error('bad checkpoint bytes');new Uint8Array(v).set(b,args[0]);return;}
  if(nodes[id])throw Error('duplicate checkpoint node');nodes[id]={type,args,entries:[]};
  if(type==='Buffer'){if(!Number.isSafeInteger(args[0])||args[0]<0||args[0]>128*1024*1024)throw Error('checkpoint buffer bound');values[id]=new ArrayBuffer(args[0]);}
  else if(type==='Map')values[id]=new Map();else if(type==='Set')values[id]=new Set();else if(type==='Array')values[id]=[];else if(type==='Object')values[id]={};
  else if(!['View','Float','Derived','String','ExternalBuffer','ExternalString','ExternalObject'].includes(type))throw Error('unknown checkpoint node');
 };
 const parse=(b:Uint8Array)=>{inflated+=b.length;if(inflated>512*1024*1024)throw Error('execution graph exceeds bound');for(let offset=0;offset<b.length;offset+=32768){pending+=decoder.decode(b.subarray(offset,offset+32768),{stream:true});let at,consumed=0;while((at=pending.indexOf('\n',consumed))>=0){const line=pending.slice(consumed,at);consumed=at+1;if(line.length>65536)throw Error('checkpoint record bound');record(JSON.parse(line));}pending=pending.slice(consumed);if(pending.length>65536)throw Error('checkpoint record bound');}};
 const gunzip=new Gunzip(parse);for(let at=0;at<bytes.length;at+=32768)gunzip.push(bytes.subarray(at,at+32768),false);gunzip.push(new Uint8Array(),true);pending+=decoder.decode();if(pending)throw Error('truncated checkpoint record');
 const val=(v:any):any=>{if(!v||typeof v!=='object')return v;if('r'in v){if(!nodes[v.r])throw Error('bad checkpoint reference');return get(v.r);}if(v.u)return undefined;if(v.s)return v.s.join('');if(v.n)return v.n==='-0'?-0:Number(v.n);throw Error('bad checkpoint value');};
 const get=(id:number):any=>{if(values[id]!==undefined)return values[id];const {type,args}=nodes[id];
  if(type==='View'){const C=types[args[0] as keyof typeof types];if(!C)throw Error('bad checkpoint view');return values[id]=new C(val(args[1]),args[2],args[3]);}
  if(type==='Float')return values[id]=new JsonFloat(val(args[0]),val(args[1]));
  if(type==='String')return values[id]=nodes[id].entries.join('');
  if(type==='ExternalObject'){if(!bank)throw Error('missing checkpoint bank');const instance=args[2]??'blob:'+args[0];let graph=components.get(instance);if(!graph){graph=unpackState(bank.read(args[0]),store,bank,components,true);components.set(instance,graph!);for(let node=0;node<graph!.length;node++){const v=graph![node];if(v&&typeof v==='object'&&!bank.external.has(v))bank.external.set(v,{key:args[0],node,instance});}}if(args[1]<0||args[1]>=graph!.length)throw Error('bad component reference');return values[id]=graph![args[1]];}
  if(type==='ExternalBuffer'||type==='ExternalString'){if(!bank)throw Error('missing checkpoint bank');const b=bank.read(args[0]);if(type==='ExternalBuffer')return values[id]=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
   if(args[1]!=='u16')return values[id]=new TextDecoder('utf-8',{fatal:true}).decode(b);if(b.byteLength%2)throw Error('bad string code units');const units=new Uint16Array(b.buffer,b.byteOffset,b.byteLength/2),pieces:string[]=[];for(let at=0;at<units.length;at+=TEXT)pieces.push(String.fromCharCode(...units.subarray(at,at+TEXT)));return values[id]=pieces.join('');}
  if(type==='Derived'){const meta:any={};for(const [k,v]of args[1])put(meta,k,val(v));return values[id]=store.attach(args[0],meta,args[2]);}
  throw Error('bad checkpoint allocation');
 };
 const put=(object:any,key:string,v:any)=>{if(key==='__proto__')Object.defineProperty(object,key,{value:v,enumerable:true,writable:true,configurable:true});else object[key]=v;};
 for(let i=0;i<nodes.length;i++)get(i);
 for(let i=0;i<nodes.length;i++){const {type,entries}=nodes[i],v=values[i];for(const e of entries){if(type==='Map')v.set(val(e[0]),val(e[1]));else if(type==='Set')v.add(val(e));else if(type==='Array')v.push(val(e));else if(type==='Object')put(v,e[0],val(e[1]));}}
 return allNodes?values:values[0];
}
