import {packState,unpackState} from './stateGraph';
import {derivedResultKey,type ResultStore} from './resultStore';
import {Gzip,Gunzip} from 'fflate';
import {fromBase64} from '../format/base64';
import {JsonFloat} from '../format/json';
import {PatchRecordWriter,PatchRecordReader} from './patchRecords';
type Path=any[];
type Graph={root:any;nodes:any[]};
export type InversePatch={back:Graph;forward:Graph};
const ownFields=(v:any):[string,any][]=>{const out:[string,any][]=[];for(const k of Object.getOwnPropertyNames(v)){const d=Object.getOwnPropertyDescriptor(v,k)!;if('value'in d)out.push([k,d.value]);}return out;};
function sameBytes(a:ArrayBuffer,b:ArrayBuffer):boolean {if(a.byteLength!==b.byteLength)return false;const n=a.byteLength>>>2,x=new Uint32Array(a,0,n),y=new Uint32Array(b,0,n);for(let i=0;i<n;i++)if(x[i]!==y[i])return false;const aa=new Uint8Array(a),bb=new Uint8Array(b);for(let i=n*4;i<aa.length;i++)if(aa[i]!==bb[i])return false;return true;}
function child(v:any,k:any):any {
 if(typeof k==='object'){if('m'in k)return [...v][k.m]?.[k.k];if('s'in k)return [...v][k.s];}
 return v[k];
}
/** These execution inputs are replaced, never edited in place by MapSession. Their
 * immutable topology can be indexed once, rather than rescanning imported entity JSON
 * on every brush. Mutable current caches are deliberately excluded. */
export class PatchIndices {
 private cached=new WeakMap<object,Map<string,Map<object,Path>>>();
 for(root:any):Map<object,Path>[] {
  const result:Map<object,Path>[]=[];
  for(const name of ['gen','baseCache','fieldCache','keptCache','storedWaterCache']){
   const anchor=root[name];if(!anchor||typeof anchor!=='object')continue;
   let slots=this.cached.get(anchor);if(!slots){slots=new Map();this.cached.set(anchor,slots);}let index=slots.get(name);
   if(!index){index=new Map();const visit=(v:any,p:Path):void=>{if(!v||typeof v!=='object'||index!.has(v))return;index!.set(v,p);
    if(v instanceof ArrayBuffer||derivedResultKey(v)!==undefined||v instanceof JsonFloat)return;
    if(ArrayBuffer.isView(v)){visit(v.buffer,[...p,'buffer']);return;}
    if(v instanceof Map){let i=0;for(const [k,x]of v){visit(k,[...p,{m:i,k:0}]);visit(x,[...p,{m:i,k:1}]);i++;}return;}
    if(v instanceof Set){let i=0;for(const x of v)visit(x,[...p,{s:i++}]);return;}
    for(const [k,x]of ownFields(v))visit(x,[...p,k]);
   };visit(anchor,[name]);slots.set(name,index);}
   result.push(index);
  }return result;
 }
}
function graph(source:any,target:any,indices?:PatchIndices):Graph {
 // Source and target are stable during this synchronous traversal. Cache descriptors
 // only for this call; native history/cache wrappers may change between transactions.
 const fieldCache=new WeakMap<object,[string,any][]>(),fields=(v:object)=>{let result=fieldCache.get(v);if(!result){result=ownFields(v);fieldCache.set(v,result);}return result;};
 const paths=new Map<object,Path>(),nodes:any[]=[],seen=new Map<object,any>(),shortcuts=new Map<object,Path>(),claimed=new Map<object,object>();
 const sourceAnchors=indices?.for(source)??[],targetAnchors=indices?.for(target)??[];
 const anchored=(v:object,maps:Map<object,Path>[])=>maps.some(m=>m.has(v));
 const sourcePath=(v:object)=>paths.get(v)??sourceAnchors.find(m=>m.has(v))?.get(v);
 let anchors=targetAnchors;
 const index=(v:any,p:Path)=>{if(!v||typeof v!=='object'||paths.has(v)||anchored(v,anchors))return;paths.set(v,p);
  if(v instanceof ArrayBuffer||derivedResultKey(v)!==undefined||v instanceof JsonFloat)return;
  if(ArrayBuffer.isView(v)){index(v.buffer,[...p,'buffer']);return;}
  if(v instanceof Map){let i=0;for(const [k,x]of v){index(k,[...p,{m:i,k:0}]);index(x,[...p,{m:i,k:1}]);i++;}return;}
  if(v instanceof Set){let i=0;for(const x of v)index(x,[...p,{s:i++}]);return;}
  for(const [k,x]of fields(v))index(x,[...p,k]);
 };index(target,[]);const targetObjects=new Set(paths.keys());paths.clear();anchors=sourceAnchors;index(source,[]);
 const equal=(t:any,s:any):boolean=>{
  const pairs=new Map<object,object>(),reverse=new Map<object,object>();
  const visit=(a:any,b:any):boolean=>{
   if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||a.constructor!==b.constructor)return false;
   if(derivedResultKey(a)!==undefined||derivedResultKey(b)!==undefined)return false;
   if(targetObjects.has(b)||anchored(b,targetAnchors)||sourcePath(a)||claimed.has(b)&&claimed.get(b)!==a)return false;
   if(pairs.has(a))return pairs.get(a)===b;if(reverse.has(b))return false;pairs.set(a,b);reverse.set(b,a);
   if(a instanceof ArrayBuffer)return sameBytes(a,b);
   if(ArrayBuffer.isView(a))return a.byteOffset===b.byteOffset&&(a as any).length===(b as any).length&&visit(a.buffer,b.buffer);
   if(a instanceof Map){const x=[...a],y=[...b];return x.length===y.length&&x.every(([k,v],i)=>visit(k,y[i][0])&&visit(v,y[i][1]));}
   if(a instanceof Set){const x=[...a],y=[...b];return x.length===y.length&&x.every((v,i)=>visit(v,y[i]));}
   const x=fields(a),y=fields(b);return x.length===y.length&&x.every(([k,v],i)=>k===y[i][0]&&visit(v,y[i][1]));
  };
  if(!visit(t,s))return false;for(const [a,b]of pairs){const p=sourcePath(b);if(!p)return false;shortcuts.set(a,p);claimed.set(b,a);}return true;
 };
 const value=(t:any,s:any,p?:Path):any=>{
  if(typeof t==='string'&&t.length>8192){const id=nodes.length;nodes.push({t:'literal',v:t});return {r:id};}
  if(!t||typeof t!=='object')return {v:t};
  const prior=seen.get(t);if(prior!==undefined)return prior;
  const known=sourcePath(t)??shortcuts.get(t);if(known){const ref={p:known};seen.set(t,ref);return ref;}
  if(p&&equal(t,s)){const ref={p};seen.set(t,ref);return ref;}
  const id=nodes.length;seen.set(t,{r:id});nodes.push(null);
  if(derivedResultKey(t)!==undefined||t instanceof JsonFloat||t instanceof Set){nodes[id]={t:'literal',v:t};return {r:id};}
  if(t instanceof ArrayBuffer){const a=new Uint8Array(t),b=s instanceof ArrayBuffer&&s.byteLength===t.byteLength?new Uint8Array(s):null,runs:any[]=[];
   if(b){for(let i=0;i<a.length;){if(a[i]===b[i]){i++;continue;}const start=i++;let end=i;while(i<a.length){if(a[i]!==b[i])end=i+1;else if(i-end>8)break;i++;}runs.push([start,a.slice(start,end)]);}}
   nodes[id]=b?{t:'buffer',p,runs}:{t:'literal',v:t};return {r:id};
  }
  if(ArrayBuffer.isView(t)){nodes[id]={t:'view',name:t.constructor.name,buffer:value(t.buffer,ArrayBuffer.isView(s)?s.buffer:undefined,p&&[...p,'buffer']),offset:t.byteOffset,length:(t as any).length};return {r:id};}
  if(t instanceof Map){const before=s instanceof Map?[...s]:[],positions=new Map(before.map(([k],i)=>[k,i]));nodes[id]={t:'map',entries:[...t].map(([k,x])=>{const j=positions.get(k);return [value(k,j===undefined?undefined:before[j][0],j===undefined?undefined:p&&[...p,{m:j,k:0}]),value(x,j===undefined?undefined:before[j][1],j===undefined?undefined:p&&[...p,{m:j,k:1}])];})};return {r:id};}
  const array=Array.isArray(t),compatible=array?Array.isArray(s):s&&typeof s==='object'&&!ArrayBuffer.isView(s)&&!(s instanceof Map)&&!(s instanceof Set)&&!(s instanceof ArrayBuffer)&&!(s instanceof JsonFloat);
  const ids=array&&compatible?new Map(s.map((x:any,i:number)=>[x?.id,i]).filter(([id]:any)=>typeof id==='string')):null;
  const groups=new Map<string,{p:Path;moves:number[]}>();
  const changes:any[]=[];for(const [k,x]of fields(t)){if(array&&k==='length')continue;if(compatible&&Object.hasOwn(s,k)&&Object.is(x,s[k]))continue;
   const ref=x&&typeof x==='object'?(sourcePath(x)??shortcuts.get(x)):undefined;
   if(array&&ref&&/^\d+$/.test(String(ref.at(-1)))&&/^\d+$/.test(k)){const prefix=ref.slice(0,-1),id=JSON.stringify(prefix),group=groups.get(id)??{p:prefix,moves:[] as number[]};group.moves.push(Number(k),Number(ref.at(-1)));groups.set(id,group);continue;}
   const paired=ids&&x&&typeof x.id==='string'&&ids.has(x.id)?String(ids.get(x.id)):k,encoded=value(x,compatible?s[paired]:undefined,compatible?p&&[...p,paired]:undefined);
   if(encoded.p&&p&&JSON.stringify(encoded.p)===JSON.stringify([...p,k]))continue;
   if(encoded.p&&compatible){let existing=source;for(const key of encoded.p)existing=child(existing,key);if(Object.hasOwn(s,k)&&Object.is(s[k],existing))continue;}
   if(array&&encoded.p&&/^\d+$/.test(String(encoded.p.at(-1)))&&/^\d+$/.test(k)){const prefix=encoded.p.slice(0,-1),id=JSON.stringify(prefix),group=groups.get(id)??{p:prefix,moves:[] as number[]};group.moves.push(Number(k),Number(encoded.p.at(-1)));groups.set(id,group);continue;}
   if(encoded.p&&p&&JSON.stringify(encoded.p)===JSON.stringify([...p,k]))continue;changes.push([k,encoded]);}
  const remove=compatible?Object.keys(s).filter(k=>!Object.hasOwn(t,k)):[];
  const keys=Object.keys(t),predicted=compatible?[...Object.keys(s).filter(k=>!remove.includes(k)),...keys.filter(k=>!Object.hasOwn(s,k))]:keys;
  const order=!array&&keys.some((k,i)=>k!==predicted[i])?keys:undefined;
  nodes[id]={t:array?'array':'object',p:compatible?p:undefined,changes,remove,copies:[...groups.values()],order,...(array?{length:t.length}:{})};return {r:id};
 };return {root:value(target,source,[]),nodes};
}
/** Lossless graph changes: only differing raw bytes and metadata. Float bits, aliases,
 * view offsets, entity order and hidden inputs to the next edit are retained. */
export function inversePatch(before:object,after:object,indices?:PatchIndices):InversePatch {return {back:graph(after,before,indices),forward:graph(before,after,indices)};}
export function applyPatch(source:any,g:Graph):any {
 const made:any[]=[],types:any={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
 const path=(p:Path)=>{if(!Array.isArray(p))throw Error('invalid patch source');let v=source;for(const k of p){if(v===null||v===undefined)throw Error('missing patch source');v=child(v,k);}return v;};
 const value=(v:any):any=>Object.hasOwn(v,'v')?v.v:Object.hasOwn(v,'p')?path(v.p):get(v.r);
 const get=(id:number):any=>{if(!Number.isSafeInteger(id)||id<0||id>=g.nodes.length)throw Error('invalid patch reference');if(made[id]!==undefined)return made[id];const n=g.nodes[id];
  if(n.t==='ref')return made[id]=path(n.p);
  if(n.t==='literal')return made[id]=n.v;
  if(n.t==='buffer'){const old=path(n.p);if(!(old instanceof ArrayBuffer))throw Error('invalid patch buffer');const b=old.slice(0),bytes=new Uint8Array(b);for(const [at,v]of n.runs){if(!Number.isSafeInteger(at)||at<0||at+v.length>bytes.length)throw Error('patch outside buffer');bytes.set(v,at);}return made[id]=b;}
  if(n.t==='view'){const C=types[n.name];if(!C)throw Error('invalid patch view');return made[id]=new C(value(n.buffer),n.offset,n.length);}
  if(n.t==='map'){const m=made[id]=new Map();for(const [k,v]of n.entries)m.set(value(k),value(v));return m;}
  if(n.t!=='array'&&n.t!=='object')throw Error('invalid patch node');
  const base=n.p===undefined?undefined:path(n.p),out=made[id]=n.t==='array'?(base?base.slice():[]):(base?{...base}:{});
  for(const k of n.remove)delete out[k];for(const group of n.copies??[]){const from=path(group.p);if(group.ranges){for(let i=0;i<group.ranges.length;i+=3)for(let j=0;j<group.ranges[i+2];j++)out[group.ranges[i]+j]=from[group.ranges[i+1]+j];}else for(let i=0;i<group.moves.length;i+=2)out[group.moves[i]]=from[group.moves[i+1]];}for(const [k,v]of n.changes)Object.defineProperty(out,k,{value:value(v),writable:true,enumerable:true,configurable:true});if(n.t==='array')out.length=n.length;
  if(n.order){const values=n.order.map((k:string)=>out[k]);for(const k of Object.keys(out))delete out[k];for(let i=0;i<n.order.length;i++)Object.defineProperty(out,n.order[i],{value:values[i],writable:true,enumerable:true,configurable:true});}return out;
 };return value(g.root);
}
function compactGraph(g:Graph):Graph {
 const resolve=(v:any):any=>v&&Object.hasOwn(v,'r')&&g.nodes[v.r]?.t==='ref'?{p:g.nodes[v.r].p}:v;
 const nodes=g.nodes.map(n=>({...n}));
 for(const n of nodes){if(n.t==='view')n.buffer=resolve(n.buffer);if(n.t==='map')n.entries=n.entries.map(([k,v]:any)=>[resolve(k),resolve(v)]);
  if(n.t==='array'||n.t==='object'){const changes:any[]=[],groups=new Map<string,{p:Path;moves:number[]}>();n.copies=(n.copies??[]).map((x:any)=>x.ranges?{p:x.p,ranges:x.ranges}:{p:x.p,moves:x.moves.filter((v:number,i:number)=>JSON.stringify(x.p)!==JSON.stringify(n.p)||x.moves[i-i%2]!==x.moves[i-i%2+1])}).filter((x:any)=>(x.ranges??x.moves).length);
   for(const [k,original]of n.changes){const v=resolve(original);if(v.p&&n.p&&JSON.stringify(v.p)===JSON.stringify([...n.p,k]))continue;
    if(n.t==='array'&&v.p&&/^\d+$/.test(String(v.p.at(-1)))&&/^\d+$/.test(k)){const p=v.p.slice(0,-1),id=JSON.stringify(p),group=groups.get(id)??{p,moves:[] as number[]};group.moves.push(Number(k),Number(v.p.at(-1)));groups.set(id,group);}else changes.push([k,v]);}
   n.changes=changes;n.copies.push(...groups.values());n.copies=n.copies.map((group:any)=>{if(group.ranges)return group;const ranges:number[]=[];for(let i=0;i<group.moves.length;i+=2){const a=group.moves[i],b=group.moves[i+1],last=ranges.length-3;if(last>=0&&a===ranges[last]+ranges[last+2]&&b===ranges[last+1]+ranges[last+2])ranges[last+2]++;else ranges.push(a,b,1);}return {p:group.p,ranges};});
  }
 }
 const used=new Set<number>(),mark=(v:any)=>{v=resolve(v);if(!v||!Object.hasOwn(v,'r')||used.has(v.r))return;used.add(v.r);const n=nodes[v.r];if(!n)throw Error('missing patch node');if(n.t==='view')mark(n.buffer);if(n.t==='map')for(const [k,v]of n.entries){mark(k);mark(v);}if(n.changes)for(const [,v]of n.changes)mark(v);};
 const root=resolve(g.root);mark(root);const indices=[...used].sort((a,b)=>a-b),ids=new Map(indices.map((old,i)=>[old,i]));
 const remap=(v:any):any=>Object.hasOwn(v,'r')?{r:ids.get(v.r)}:v;
 return {root:remap(root),nodes:indices.map(id=>{const n=nodes[id];if(n.t==='view')n.buffer=remap(n.buffer);if(n.t==='map')n.entries=n.entries.map(([k,v]:any)=>[remap(k),remap(v)]);if(n.changes)n.changes=n.changes.map(([k,v]:any)=>[k,remap(v)]);return n;})};
}
export const compactPatch=(p:InversePatch):InversePatch=>({back:compactGraph(p.back),forward:compactGraph(p.forward)});
function deatom(v:any):any {if(v&&typeof v==='object'){if(Object.keys(v).length===1&&Object.hasOwn(v,'@scalar')){const n=v['@scalar'];return n==='undefined'?undefined:n==='-0'?-0:Number(n);}for(const k of Object.keys(v))Object.defineProperty(v,k,{value:deatom(v[k]),enumerable:true,writable:true,configurable:true});}return v;}
/** Bounded literal records avoid expanding each tiny metadata patch into a second object
 * graph. Binary changes and the uncommon new opaque value have their own chunk records. */
export function packPatch(patch:InversePatch):{bytes:Uint8Array;results:number[];blobs:number[];patch:InversePatch} {
 patch=compactPatch(patch);
 const out:Uint8Array[]=[],results=new Set<number>(),gzip=new Gzip({level:6,mtime:0},b=>out.push(b)),records=new PatchRecordWriter();
 const pending=new Uint8Array(32768);let used=0;
 const push=(b:Uint8Array)=>{for(let at=0;at<b.length;){const n=Math.min(b.length-at,pending.length-used);pending.set(b.subarray(at,at+n),used);used+=n;at+=n;if(used===pending.length){gzip.push(pending,false);used=0;}}};push(new Uint8Array([73,80,66,49]));
 const emit=(r:any)=>{const b=records.encode(r),len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,b.length,true);push(len);push(b);};
 const list=(direction:string,id:number,name:string,items:any[]):void=>{for(let at=0;at<items.length;){let count=Math.min(256,items.length-at);for(;;){try{emit(['list',direction,id,name,items.slice(at,at+count)]);break;}catch(error){if(count===1||String(error)!=='Error: patch record bound')throw error;count=Math.ceil(count/2);}}at+=count;}};
 emit(['roots',patch.back.root,patch.forward.root]);
 for(const [direction,g]of [['back',patch.back],['forward',patch.forward]] as const)for(let id=0;id<g.nodes.length;id++){
  const n=g.nodes[id],{changes,entries,runs,copies,order,remove,...small}=n;
  if(n.t==='literal'){const p=packState({value:n.v});for(const k of p.results)results.add(k);emit(['node',direction,id,{t:'packed'}]);for(let at=0;at<p.bytes.length;at+=16384)emit(['literal',direction,id,p.bytes.subarray(at,at+16384)]);continue;}
  emit(['node',direction,id,small]);
  if(copies)for(const group of copies)for(let at=0;at<group.ranges.length;at+=384)emit(['copy-range',direction,id,group.p,group.ranges.slice(at,at+384)]);
  for(const [name,items]of [['changes',changes],['entries',entries],['remove',remove],['order',order]] as const)if(items){if(name==='order')emit(['list',direction,id,name,[]]);list(direction,id,name,items);}
  if(runs)for(const [start,bytes]of runs)for(let at=0;at<bytes.length;at+=16384)emit(['run',direction,id,start+at,bytes.subarray(at,at+16384)]);
 }
 gzip.push(pending.subarray(0,used),true);const bytes=new Uint8Array(out.reduce((n,b)=>n+b.length,0));let at=0;for(const b of out){bytes.set(b,at);at+=b.length;}return {bytes,results:[...results],blobs:[],patch};
}
function patchDecoder(store:ResultStore) {
 const patch:InversePatch={back:{root:null,nodes:[]},forward:{root:null,nodes:[]}},literals=new Map<any,Uint8Array[]>(),decoder=new TextDecoder('utf-8',{fatal:true}),binary=new PatchRecordReader();let pending='',inflated=0,wire=new Uint8Array(),mode:undefined|'binary'|'json';
 const record=(r:any)=>{const [kind,direction,id,...args]=r;if(kind==='roots'){patch.back.root=direction;patch.forward.root=id;return;}
  if(!['back','forward'].includes(direction)||!Number.isSafeInteger(id)||id<0||id>1000000)throw Error('invalid patch record');const nodes=patch[direction as 'back'|'forward'].nodes;
  if(kind==='node'){if(nodes[id])throw Error('duplicate patch node');nodes[id]={...args[0]};if(nodes[id].t==='buffer')nodes[id].runs=[];if(['array','object'].includes(nodes[id].t)){nodes[id].changes=[];nodes[id].remove??=[];}if(nodes[id].t==='map')nodes[id].entries=[];return;}
  const node=nodes[id];if(!node)throw Error('patch data before node');
  if(kind==='copy'){(node.copies??=[]).push({p:args[0],moves:args[1]});}
  else if(kind==='copy-range'){(node.copies??=[]).push({p:args[0],ranges:args[1]});}
  else if(kind==='list'){if(!['changes','entries','remove','order'].includes(args[0]))throw Error('invalid patch list');(node[args[0]]??=[]).push(...args[1]);}
  else if(kind==='run')node.runs.push([args[0],args[1] instanceof Uint8Array?args[1]:fromBase64(args[1])]);
  else if(kind==='literal'){const list=literals.get(node)??[];list.push(args[0] instanceof Uint8Array?args[0]:fromBase64(args[0]));literals.set(node,list);}
  else throw Error('unknown patch record');
 };
 const json=(b:Uint8Array)=>{pending+=decoder.decode(b,{stream:true});let at;while((at=pending.indexOf('\n'))>=0){if(at>65536)throw Error('patch record bound');record(deatom(JSON.parse(pending.slice(0,at))));pending=pending.slice(at+1);}if(pending.length>65536)throw Error('patch record bound');};
 const push=(b:Uint8Array)=>{inflated+=b.length;if(inflated>512*1024*1024)throw Error('inverse patch exceeds bound');if(mode==='json'){json(b);return;}const joined=new Uint8Array(wire.length+b.length);joined.set(wire);joined.set(b,wire.length);wire=joined;if(!mode){if(wire.length<4)return;mode=wire.subarray(0,4).every((v,i)=>v===[73,80,66,49][i])?'binary':'json';if(mode==='json'){json(wire);wire=new Uint8Array();return;}wire=wire.subarray(4);}
  let at=0;while(at+4<=wire.length){const n=new DataView(wire.buffer,wire.byteOffset+at,4).getUint32(0,true);if(!n||n>65536)throw Error('patch record bound');if(at+4+n>wire.length)break;record(binary.decode(wire.subarray(at+4,at+4+n)));at+=4+n;}wire=wire.slice(at);if(wire.length>65540)throw Error('patch record bound');};
 const finish=(bytes:Uint8Array):InversePatch=>{pending+=decoder.decode();if(pending||wire.length||!mode||bytes.length<18||new DataView(bytes.buffer,bytes.byteOffset+bytes.length-4,4).getUint32(0,true)!==inflated)throw Error('truncated patch');
 for(const [node,parts]of literals){const b=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let at=0;for(const x of parts){b.set(x,at);at+=x.length;}node.t='literal';node.v=unpackState(b,store).value;}
 return patch;};return {push,finish};
}
export function unpackPatch(bytes:Uint8Array,store:ResultStore):InversePatch {
 const parser=patchDecoder(store),gunzip=new Gunzip(parser.push);for(let at=0;at<bytes.length;at+=32768)gunzip.push(bytes.subarray(at,at+32768),false);gunzip.push(new Uint8Array(),true);return parser.finish(bytes);
}
