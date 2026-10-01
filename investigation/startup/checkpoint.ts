// Optional format-3 acceleration data. This ABI must change whenever build semantics change.
import type { BuildResult } from "../features/build";
import type { MapDocument } from "./document";
import { GENERATOR_VERSION } from "../spec/mapspec";
import { fromBase64, toBase64 } from "../format/base64";
import { JsonFloat } from "../format/json";

export interface BuildCheckpoint { abi: string; binding: string; digest: string; graph: unknown[]; blobs: string[] }
const ABI = "startup-build-4/" + GENERATOR_VERSION;
const constructors = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };

// SHA-256, synchronous so the core's open/save interface remains synchronous. Tested against
// node:crypto, including Unicode, padding boundaries and all checkpoint payloads.
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(size); data.set(bytes); data[bytes.length] = 128;
  const view = new DataView(data.buffer); view.setUint32(size - 8, Math.floor(bytes.length / 0x20000000)); view.setUint32(size - 4, bytes.length * 8);
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) if (!primes.some(p => p * p <= n && n % p === 0)) primes.push(n);
  const k = primes.map(p => (Math.cbrt(p) % 1 * 0x100000000) >>> 0);
  const h = primes.slice(0, 8).map(p => (Math.sqrt(p) % 1 * 0x100000000) >>> 0), w = new Uint32Array(64);
  const rr = (v: number, n: number) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < size; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; w[i] = w[i-16] + (rr(a,7)^rr(a,18)^(a>>>3)) + w[i-7] + (rr(b,17)^rr(b,19)^(b>>>10)); }
    let [a,b,c,d,e,f,g,j] = h;
    for (let i = 0; i < 64; i++) { const t = (j + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) | 0;
      const u = ((rr(a,2)^rr(a,13)^rr(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
      j=g;g=f;f=e;e=(d+t)|0;d=c;c=b;b=a;a=(t+u)|0;
    }
    [a,b,c,d,e,f,g,j].forEach((v,i) => h[i] = (h[i]+v)>>>0);
  }
  return h.map(v => v.toString(16).padStart(8,"0")).join("");
}

function binding(doc: MapDocument): string {
  // Exclude camera/name/time metadata, include every input to replay and build. Normalize the
  // compact-file omission of baseFeatures. Upgraded documents consequently invalidate old caches.
  return sha256(JSON.stringify([doc.formatVersion,doc.generatorVersion,doc.spec,doc.base,doc.field??null,doc.baseFeatures??doc.features,doc.kept,doc.features,doc.edits,doc.nextSeq]));
}

export function checkpoint(doc: MapDocument, built: BuildResult): BuildCheckpoint {
  // Per-feature distance/noise fields are memoization, not saved state. The next feature tool
  // computes them on demand through the existing BuildTarget path. Keep every actual build,
  // water, brush and resource cache needed by the opened map. Opening is not a dirty edit.
  built = { ...built, dirty:null, cache:{...built.cache,fields:new Map()} };
  const graph: unknown[] = [], seen = new Map<object, number>(), counts=new Map<object,number>();
  const blobs:string[]=[], blobIds=new Map<string,number>();
  const count=(v:any)=>{if(!v||typeof v!=="object")return;const n=counts.get(v)??0;counts.set(v,n+1);if(n)return;
    if(ArrayBuffer.isView(v)||v instanceof JsonFloat)return;
    if(v instanceof Map)for(const [k,x] of v){count(k);count(x);}
    else for(const x of v instanceof Set?v:Object.values(v))count(x);
  };count(built);counts.set(built,2);
  const byteBlob=(v:any)=>{
    const raw=new Uint8Array(v.buffer,v.byteOffset,v.byteLength),width=v.BYTES_PER_ELEMENT,n=raw.length/width,bytes=new Uint8Array(raw.length);
    // Lossless byte transposition groups exponents/zero bytes before gzip. Equal buffers share
    // storage, but decoding creates distinct arrays, retaining the original alias relationships.
    for(let b=0;b<width;b++)for(let i=0;i<n;i++)bytes[b*n+i]=raw[i*width+b];
    const text=toBase64(bytes);if(!blobIds.has(text)){blobIds.set(text,blobs.length);blobs.push(text);}return blobIds.get(text)!;
  };
  function encode(v: any): any {
    if (v === undefined) return { special:"undefined" };
    if (typeof v === "number" && (!Number.isFinite(v) || Object.is(v,-0))) return { special:String(v), negativeZero:Object.is(v,-0) };
    if (v === null || typeof v !== "object") { if (typeof v === "function") throw Error("unsupported cache value"); return v; }
    if((counts.get(v)??0)===1 && !(v instanceof Map) && !(v instanceof Set) && !ArrayBuffer.isView(v)) {
      if(v instanceof JsonFloat)return {inlineFloat:[encode(v.value),encode(v.raw)]};
      if(Array.isArray(v))return {inlineArray:v.map(encode)};
      if(Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null)throw Error("unsupported cache class");
      return {inlineObject:Object.entries(v).map(([k,x])=>[k,encode(x)])};
    }
    if (seen.has(v)) return { ref:seen.get(v) };
    const id = graph.length; seen.set(v,id); graph.push(null);
    const node = v instanceof JsonFloat ? { type:"JsonFloat", value:encode(v.value), raw:encode(v.raw) }
      : ArrayBuffer.isView(v) ? { type:v.constructor.name, blob:byteBlob(v) }
      : v instanceof Map ? { type:"Map", entries:[...v].map(([k,x])=>[encode(k),encode(x)]) }
      : v instanceof Set ? { type:"Set", entries:[...v].map(encode) }
      : Array.isArray(v) ? { type:"Array", entries:v.map(encode) }
      : { type:"Object", entries:Object.entries(v).map(([k,x])=>[k,encode(x)]) };
    graph[id] = node; return { ref:id };
  }
  encode(built);
  return { abi:ABI, binding:binding(doc), digest:sha256(JSON.stringify([graph,blobs])), graph, blobs };
}

export function restoreCheckpoint(doc: MapDocument): BuildResult | null {
  const c = doc.checkpoint;
  if (!c || c.abi !== ABI || c.binding !== binding(doc)) return null;
  try {
    if (!Array.isArray(c.graph) || !Array.isArray(c.blobs) || c.graph.length > 1000000 || c.digest !== sha256(JSON.stringify([c.graph,c.blobs]))) return null;
    const nodes = c.graph as any[], values = new Array(nodes.length);
    const decode = (v: any): any => {
      if (v === null || typeof v !== "object") return v;
      if ("ref" in v) { if (!Number.isInteger(v.ref) || v.ref<0 || v.ref>=nodes.length) throw Error("bad reference"); return values[v.ref]; }
      if("inlineFloat" in v)return new JsonFloat(decode(v.inlineFloat[0]),decode(v.inlineFloat[1]));
      if("inlineArray" in v)return v.inlineArray.map(decode);
      if("inlineObject" in v){const object={};for(const [k,x] of v.inlineObject)Object.defineProperty(object,k,{value:decode(x),enumerable:true,writable:true,configurable:true});return object;}
      if (v.special === "undefined") return undefined;
      if (v.negativeZero) return -0;
      if (["NaN","Infinity","-Infinity"].includes(v.special)) return Number(v.special);
      throw Error("bad value");
    };
    for (let i=0;i<nodes.length;i++) {
      const n=nodes[i];
      if (Object.hasOwn(constructors,n.type)) { const C=constructors[n.type as keyof typeof constructors], bytes=fromBase64(c.blobs[n.blob]), width=C.BYTES_PER_ELEMENT, count=bytes.length/width, buffer=new ArrayBuffer(bytes.length), raw=new Uint8Array(buffer);
        if(!Number.isInteger(count))throw Error("bad buffer");for(let b=0;b<width;b++)for(let k=0;k<count;k++)raw[k*width+b]=bytes[b*count+k];values[i]=new C(buffer); }
      else if (n.type==="JsonFloat") values[i]=new JsonFloat(decode(n.value),decode(n.raw));
      else if (n.type==="Map") values[i]=new Map();
      else if (n.type==="Set") values[i]=new Set();
      else if (n.type==="Array") values[i]=[];
      else if (n.type==="Object") values[i]={};
      else throw Error("bad node");
    }
    nodes.forEach((n,i)=> {
      if(n.type==="Map") for(const [k,v] of n.entries) values[i].set(decode(k),decode(v));
      if(n.type==="Set" || n.type==="Array") for(const v of n.entries) n.type==="Set" ? values[i].add(decode(v)) : values[i].push(decode(v));
      if(n.type==="Object") for(const [k,v] of n.entries) Object.defineProperty(values[i],k,{value:decode(v),writable:true,enumerable:true,configurable:true});
    });
    const b=values[0] as BuildResult, size=doc.base.sizeX*doc.base.sizeY;
    if (b.W!==doc.base.sizeX || b.H!==doc.base.sizeY || b.seed!==(doc.spec?.seed??0) || !b.cache || !(b.cache.keys instanceof Map) || !(b.cache.fields instanceof Map) || !(b.cache.resources instanceof Map)) return null;
    for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination,b.occupied,b.channel,b.cache.terrain.pre2,b.cache.terrain.pre7,b.cache.terrain.heights,b.cache.terrain.protect,b.cache.terrain.channel]) if(!ArrayBuffer.isView(v) || v.length!==size) return null;
    if(!Array.isArray(b.entities) || !b.waterModel || !b.settle || !Array.isArray(b.slopes) || !Array.isArray(b.sources)) return null;
    return b;
  } catch { return null; } // optional acceleration data never prevents opening an old/damaged cache
}
