/** Incremental retained-payload accounting. One graph walk per new built state, never one
 *  walk of the whole snapshot cache or the whole operation journal per edit. */
function allocationGraph(value:unknown):Map<object|string,number>{
 const found=new Map<object|string,number>();
 const visit=(v:unknown):void=>{
  if(typeof v==='string'){if(!found.has(v))found.set(v,v.length*2);return;}
  if(!v||typeof v!=='object'||found.has(v))return;
  found.set(v,32);
  if(v instanceof ArrayBuffer){found.set(v,32+v.byteLength);return;}
  if(ArrayBuffer.isView(v)){visit(v.buffer);return;}
  if(v instanceof Map){for(const [k,x]of v){visit(k);visit(x);}return;}
  if(v instanceof Set){for(const x of v)visit(x);return;}
  if(Array.isArray(v)){found.set(v,32+v.length*8);for(const x of v)visit(x);return;}
  for(const [k,d]of Object.entries(Object.getOwnPropertyDescriptors(v)))if('value'in d){
   if((k==='sculpts'||k==='sculptEdits')&&Array.isArray(d.value)){found.set(d.value,32+d.value.length*8);continue;}
   visit(d.value);
  }
 };visit(value);return found;
}
export class HistorySnapshots<T extends object> extends Map<number,T>{
 private graphs=new Map<number,Map<object|string,number>>();
 private refs=new Map<object|string,{refs:number;bytes:number}>();
 private versions=new Map<number,number|undefined>();
 bytes=0;
 constructor(entries?:Iterable<readonly[number,T]>){super();if(entries)for(const [k,v]of entries)this.set(k,v);}
 override set(key:number,value:T):this {
  const version=(value as {cache?:{fields?:{revision?:number}}}).cache?.fields?.revision;
  if(version!==undefined&&super.get(key)===value&&this.versions.get(key)===version)return this;
  this.release(key);const graph=allocationGraph(value);this.graphs.set(key,graph);
  this.versions.set(key,version);
  for(const [object,bytes]of graph){const old=this.refs.get(object);if(old)old.refs++;else{this.refs.set(object,{refs:1,bytes});this.bytes+=bytes;}}
  super.set(key,value);return this;
 }
 private release(key:number):void {
  const graph=this.graphs.get(key);if(graph){for(const object of graph.keys()){const r=this.refs.get(object)!;if(!--r.refs){this.bytes-=r.bytes;this.refs.delete(object);}}this.graphs.delete(key);}
  this.versions.delete(key);
 }
 override delete(key:number):boolean {this.release(key);return super.delete(key);}
 override clear():void {super.clear();this.graphs.clear();this.refs.clear();this.versions.clear();this.bytes=0;}
}
