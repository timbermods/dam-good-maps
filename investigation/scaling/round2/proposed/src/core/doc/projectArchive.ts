import type {ColdResults,ResultStore} from "./resultStore";
import {packState,unpackState,StateBank,BLOB_KEY,type BlobIndex} from "./stateGraph";
export const STATE_ABI='scaling-execution-1/portable-forces-v1-canonical';
export const CHECKPOINT_KEY=2**42;
const MAGIC=new TextEncoder().encode('DGM6\r\n\x1a\n'),LIMIT=128*1024*1024;
export type CheckpointIndex={at:number;key?:number;bytes:number;results:number[];blobs:number[]};
export type Archive={manifest:any;current:any;checkpoints:CheckpointIndex[];currentAt:number;bank:StateBank;patchBytes:Map<number,Uint8Array>};
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async(b:Uint8Array)=>hex(await crypto.subtle.digest('SHA-256',b as BufferSource));
/** Binary length frames carry separately compressed, bounded-record graphs. Old gzip JSON is
 * decoded by the old migration path. There is never a whole-project JSON string or inflater. */
export async function writeArchive(manifest:unknown,current:object,index:CheckpointIndex[],store:ResultStore,bank:StateBank,sink:(b:Uint8Array)=>Promise<void>):Promise<void>{
 const c=packState(current,bank),blobs=new Set(c.blobs);for(const item of index)for(const key of item.blobs)blobs.add(key);
 const blobIndex=bank.index(blobs),m=packState({...manifest as object,blobs:blobIndex,bankNextInstance:bank.nextInstance}),binding=await digest(m.bytes),results=new Set(c.results);
 for(const item of index)for(const key of item.results)results.add(key);
 await sink((manifest as any).formatVersion===5?new TextEncoder().encode('DGM5\r\n\x1a\n'):MAGIC);
 const frame=async(kind:string,key:number,bytes:Uint8Array)=>{if(bytes.length>LIMIT)throw Error('project frame exceeds capacity');
  const header=new TextEncoder().encode(JSON.stringify({kind,key,bytes:bytes.length,sha:await digest(bytes),abi:STATE_ABI,binding}));const len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,header.length,true);await sink(len);await sink(header);for(let at=0;at<bytes.length;at+=32768)await sink(bytes.subarray(at,at+32768));};
 await frame('manifest',0,m.bytes);await frame('current',0,c.bytes);
 for(const key of results)await frame('result',key,store.cold.get(key));
 for(const item of blobIndex)await frame('blob',item.key,bank.cold.get(item.key));
 for(const item of index)await frame((manifest as any).formatVersion===6?'patch':'checkpoint',item.at,store.cold.get(item.key??CHECKPOINT_KEY+item.at));
 await frame('end',0,new Uint8Array());
}
export async function readArchive(source:AsyncIterable<Uint8Array>|Iterable<Uint8Array>,store:ResultStore):Promise<Archive|null>{
 const iterator=(source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]?.()??(source as Iterable<Uint8Array>)[Symbol.iterator]();let pending:Uint8Array=new Uint8Array(),offset=0,done=false;
 const take=async(n:number,optional=false)=>{const out=new Uint8Array(n);let at=0;while(at<n){if(offset===pending.length){const r=await iterator.next();if(r.done){done=true;if(optional&&at===0)return null;throw Error('truncated project archive');}pending=r.value;offset=0;}
   const count=Math.min(n-at,pending.length-offset);out.set(pending.subarray(offset,offset+count),at);offset+=count;at+=count;}return out;};
 const magic=await take(MAGIC.length);if(!magic!.every((v,i)=>i===3?(v===53||v===54):v===MAGIC[i]))throw Error('not a stored-state archive');
 let manifest:any,currentBytes:Uint8Array|undefined,binding:string|undefined;const patchBytes=new Map<number,Uint8Array>();let retained=0;const checkpoints:CheckpointIndex[]=[],seen=new Set<string>();
 for(;;){const len=await take(4);const n=new DataView(len!.buffer).getUint32(0,true);if(!n||n>4096)throw Error('invalid project header');const h=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode((await take(n))!));
  if(h.abi!==STATE_ABI)throw Error('unsupported execution ABI; original engine required');if(!Number.isSafeInteger(h.bytes)||h.bytes<0||h.bytes>LIMIT||!Number.isSafeInteger(h.key))throw Error('invalid project frame');
  if(binding!==undefined&&h.binding!==binding)throw Error('project binding mismatch');
  const unique=h.kind+':'+h.key;if(seen.has(unique))throw Error('duplicate project frame');seen.add(unique);
  const bytes=(await take(h.bytes))!;if(await digest(bytes)!==h.sha)throw Error('project checksum mismatch');
  if(h.kind==='manifest'){if(binding!==undefined||h.key!==0||h.binding!==h.sha)throw Error('invalid project manifest');binding=h.sha;manifest=unpackState(bytes,store);}
  else if(binding===undefined)throw Error('missing project manifest');
  else if(h.kind==='current'){if(h.key!==0)throw Error('invalid current state');currentBytes=bytes;}
  else if(h.kind==='result'){if(h.key<1||h.key>=CHECKPOINT_KEY)throw Error('invalid result key');store.cold.put(h.key,bytes);}
  else if(h.kind==='blob'){if(!manifest?.blobs?.some((x:BlobIndex)=>x.key===h.key&&x.bytes===bytes.length)||h.key<BLOB_KEY)throw Error('invalid state blob');store.cold.put(h.key,bytes);}
  else if(h.kind==='checkpoint'||h.kind==='patch'){if(manifest?.patches&&h.kind!=='patch'||manifest?.formatVersion===5&&h.kind!=='checkpoint')throw Error('history frame kind differs');const item=(manifest?.patches??manifest?.checkpoints)?.find((x:CheckpointIndex)=>x.at===h.key);if(!item||item.bytes!==bytes.length)throw Error('checkpoint index differs');if(item.key!==undefined&&(!Number.isSafeInteger(item.key)||item.key<CHECKPOINT_KEY||item.key>=BLOB_KEY))throw Error("invalid inverse key");store.cold.put(item.key??CHECKPOINT_KEY+h.key,bytes);checkpoints.push(item);if(manifest.formatVersion===6){patchBytes.set(item.at,bytes);retained+=bytes.length;while(patchBytes.size>1&&retained>32*1024*1024){const key=patchBytes.keys().next().value!;retained-=patchBytes.get(key)!.length;patchBytes.delete(key);}}}
  else if(h.kind==='end'){if(h.bytes||h.key)throw Error('invalid project end');break;}
  else throw Error('unknown project frame');
 }
 if(offset!==pending.length||await take(1,true)!==null||!done)throw Error('trailing project data');
 if(!manifest||!currentBytes||checkpoints.length!==(manifest.patches??manifest.checkpoints).length)throw Error('incomplete project archive');
 const bank=new StateBank(store.cold,manifest.blobs,manifest.bankNextInstance??1);return {manifest,current:unpackState(currentBytes,store,bank),checkpoints,currentAt:manifest.cursor,bank,patchBytes};
}
export async function archiveSource(source:Iterable<Uint8Array>|AsyncIterable<Uint8Array>):Promise<{archive:boolean;source:AsyncIterable<Uint8Array>}>{
 const iterator=(source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]?.()??(source as Iterable<Uint8Array>)[Symbol.iterator]();const prefix:Uint8Array[]=[];let length=0;
 while(length<MAGIC.length){const r=await iterator.next();if(r.done)break;prefix.push(r.value);length+=r.value.length;}
 const first=new Uint8Array(Math.min(length,MAGIC.length));let at=0;for(const b of prefix){const n=Math.min(first.length-at,b.length);first.set(b.subarray(0,n),at);at+=n;if(at===first.length)break;}
 return {archive:first.length===MAGIC.length&&first.every((v,i)=>i===3?(v===53||v===54):v===MAGIC[i]),source:(async function*(){yield*prefix;for(;;){const r=await iterator.next();if(r.done)break;yield r.value;}})()};
}
