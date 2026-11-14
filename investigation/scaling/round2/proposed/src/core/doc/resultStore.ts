import {gzipSync,gunzipSync,strToU8,strFromU8} from "fflate";
import type {ForceResultParams} from "../forces/op";
import {toBase64,fromBase64} from "../format/base64";

/** Disposable derived data, never the journal or a project. Implemented by OPFS in a worker. */
export interface ColdResults { put(key: number, value: Uint8Array): void; get(key: number): Uint8Array; }
const keys = new WeakMap<object,string>();
export const derivedResultKey = (params: object): string | undefined => keys.get(params);
const heavy = ["tiles","heights","removed","rock","moved","felled","sources","lake","entities"] as const;
/** Estimates ordinary-array payload and metadata; the measured process heap is the external oracle. */
export function retainedBytes(value: unknown, snapshotsOnly=false): number {
  const seen = new Set<object>(),strings=new Set<string>(); let bytes = 0;
  const visit = (v: unknown): void => {
    if (typeof v === "string") {if(!strings.has(v)){strings.add(v);bytes += v.length*2;}return;}
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v); bytes += 32;
    if (ArrayBuffer.isView(v)) {visit(v.buffer);return;}
    if (v instanceof ArrayBuffer) {bytes += v.byteLength;return;}
    if (v instanceof Map) {for (const [k,x] of v) {visit(k);visit(x);}return;}
    if (v instanceof Set) {for (const x of v) visit(x);return;}
    if (Array.isArray(v)) bytes += v.length*8;
    for (const [k,d] of Object.entries(Object.getOwnPropertyDescriptors(v))) if ("value" in d) {
      // Operations are owned by the journal/log, not by these derived snapshots. Count the
      // snapshot's pointer lists without repeatedly walking every old gesture/result.
      if(snapshotsOnly&&(k==="sculpts"||k==="sculptEdits")&&Array.isArray(d.value)){bytes+=32+8*d.value.length;continue;}
      visit(d.value);
    }
  }; visit(value);return bytes;
}

export class ResultStore {
  private hot = new Map<number,{params: object;bytes: number}>();
  private bytes = 0;
  private working: {seq:number;params:object;bytes:number}|null=null;
  private lastRead:{seq:number;params:object}|null=null;
  private waterKeys = new WeakMap<object,number>();
  private waterNext = -1;
  private waterHot: {key:number;value:any} | null = null;
  hits = 0; misses = 0; writtenBytes = 0;
  constructor(readonly cold: ColdResults, readonly budget = 32*1024*1024) {
    if (!Number.isSafeInteger(budget) || budget<0) throw Error("invalid result-cache budget");
  }
  private cache<T extends object>(seq: number, params:T):T {
    const bytes = retainedBytes(params);
    while (this.hot.size && this.bytes+bytes>this.budget) {
      const key = this.hot.keys().next().value!;this.bytes -= this.hot.get(key)!.bytes;this.hot.delete(key);
    }
    // An oversized result is a one-operation working value, never permanently pinned.
    this.working=null;
    if (bytes<=this.budget) {this.hot.set(seq,{params,bytes});this.bytes+=bytes;}
    else this.working={seq,params,bytes};
    this.lastRead={seq,params};
    return params;
  }
  read<T extends object=ForceResultParams>(seq: number):T {
    if(this.lastRead?.seq===seq){this.hits++;return this.lastRead.params as T;}
    if(this.working?.seq===seq){this.hits++;return this.working.params as T;}
    const found = this.hot.get(seq);
    if (found) {this.hits++;this.hot.delete(seq);this.hot.set(seq,found);this.lastRead={seq,params:found.params};return found.params as T;}
    this.misses++;
    return this.cache(seq,JSON.parse(strFromU8(gunzipSync(this.cold.get(seq)))) as T);
  }
  keep<T extends object>(seq: number, params:T):T {
    const bytes = gzipSync(strToU8(JSON.stringify(params)),{level:1,mtime:0});
    this.cold.put(seq,bytes);this.writtenBytes+=bytes.byteLength;
    const old = this.hot.get(seq);if(old){this.bytes-=old.bytes;this.hot.delete(seq);}
    this.cache(seq,params);
    return this.attach(seq,params,heavy.filter(name=>name in params));
  }
  /** Rebind an exact saved execution cache without decoding its heavy vectors. */
  attach<T extends object>(seq:number,params:T,names:readonly string[]):T {
    const proxy = {...params};
    for(const name of names) {
      delete (proxy as Record<string,unknown>)[name];
      Object.defineProperty(proxy,name,{enumerable:true,get:()=>this.read<Record<string,unknown>>(seq)[name]});
    }
    keys.set(proxy,`derived-force-v1:${seq}`);
    return proxy;
  }
  clearHot(): void {this.hot.clear();this.bytes=0;this.working=null;this.waterHot=null;this.lastRead=null;}
  keepWater(value:object|null):number {
    if(!value)return 0;
    const known=this.waterKeys.get(value);if(known!==undefined)return known;
    const key=this.waterNext--;
    const text=JSON.stringify(value,(_k,v)=>ArrayBuffer.isView(v)?{__array:v.constructor.name,bytes:toBase64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))}:v);
    const b=gzipSync(strToU8(text),{level:1,mtime:0});this.cold.put(key,b);this.writtenBytes+=b.length;this.waterKeys.set(value,key);return key;
  }
  readWater(key:number):any {
    if(!key)return null;if(this.waterHot?.key===key)return this.waterHot.value;
    const types:Record<string,any>={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
    const value=JSON.parse(strFromU8(gunzipSync(this.cold.get(key))),(_k,v)=>{
      if(v?.__array){const Type=types[v.__array];if(!Type)throw Error("invalid transient array type");const b=fromBase64(v.bytes);return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return v;
    });
    this.waterKeys.set(value,key);this.waterHot={key,value};return value;
  }
  get stats() {return {bytes:this.bytes,entries:this.hot.size,budget:this.budget,workingBytes:this.working?.bytes??0,hits:this.hits,misses:this.misses,writtenBytes:this.writtenBytes};}
}

/** One append-only cache file per session; safe to delete after close. Open only in a dedicated worker. */
export class OpfsResults implements ColdResults {
  private offsets = new Map<number,[number,number]>(); private end = 0;
  private constructor(private handle: FileSystemSyncAccessHandle,private dir:FileSystemDirectoryHandle,private name:string) {}
  static async open(name: string): Promise<OpfsResults> {
    if(!navigator.storage?.getDirectory)throw Error("worker OPFS unavailable; an equivalent verified storage adapter is required");
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("dgm-derived-force-cache",{create:true});
    const file = await dir.getFileHandle(name,{create:true});
    const store = new OpfsResults(await file.createSyncAccessHandle(),dir,name);store.handle.truncate(0);return store;
  }
  put(key: number,value: Uint8Array): void {
    const at = this.end;let n = 0;
    while(n<value.length) {const wrote=this.handle.write(value.subarray(n),{at:at+n});if(!wrote)throw Error("derived cache write failed");n+=wrote;}
    this.offsets.set(key,[at,n]);this.end+=n;
  }
  get(key: number): Uint8Array {
    const entry=this.offsets.get(key);if(!entry)throw Error("missing derived result");
    const [at,len]=entry,b=new Uint8Array(len);let n=0;
    while(n<len){const got=this.handle.read(b.subarray(n),{at:at+n});if(!got)throw Error("truncated derived cache");n+=got;}return b;
  }
  close(): void {this.handle.close();}
  async dispose():Promise<void> {this.close();await this.dir.removeEntry(this.name);}
}
