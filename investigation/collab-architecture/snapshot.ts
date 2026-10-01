import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { Mask, type State } from './state';
import { Journal, Claims } from './architecture';
// Lossless typed-array sections, not JSON numbers (or quantized water).
function encode(value:any):any {
  if(value instanceof Mask)return {$mask:value.N,data:encode(value.words)};
  if(ArrayBuffer.isView(value))return {$array:value.constructor.name,data:Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64')};
  if(value instanceof Set)return {$set:[...value].map(encode)};
  if(value instanceof Map)return {$map:[...value].map(([k,v])=>[k,encode(v)])};
  if(Array.isArray(value))return value.map(encode);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));return value;
}
function decode(v:any):any {
  if(v?.$mask!==undefined){const m=new Mask(v.$mask);m.words=decode(v.data);return m;}
  if(v?.$array){const b=Uint8Array.from(Buffer.from(v.data,'base64'));
    const constructors:any={Uint8Array,Uint32Array,Int32Array,Float64Array};
    if(!constructors[v.$array])throw Error('invalid array');return new constructors[v.$array](b.buffer);}
  if(v?.$set)return new Set(v.$set.map(decode));if(v?.$map)return new Map(v.$map.map(([k,x]:any)=>[k,decode(x)]));
  if(Array.isArray(v))return v.map(decode);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v;
}
export function pack(j:Journal,build:string,session:string) {
  // Claims/history are session metadata. exportMap() deliberately uses only State.
  return gzipSync(strToU8(JSON.stringify(encode({version:1,endian:'LE',build,session,seq:j.seq,state:j.state,
    claims:{W:j.claims.W,H:j.claims.H,owner:j.claims.owner,revision:j.claims.revision,offers:j.claims.offers},entries:j.entries,fences:j.fences}))),{level:6});
}
export function unpack(bytes:Uint8Array,build:string,session:string) {
  const o=decode(JSON.parse(strFromU8(gunzipSync(bytes))));
  if(o.version!==1||o.endian!=='LE'||o.build!==build||o.session!==session)throw Error('snapshot build/session mismatch');
  const c=new Claims(o.state.W,o.state.H);c.owner=o.claims.owner;c.revision=o.claims.revision;c.offers=o.claims.offers;
  const j=new Journal(o.state,c);j.seq=o.seq;j.entries=o.entries;j.fences=o.fences;return j;
}
export function exportMap(state:State) { return encode(state); }
export type Presence={kind:'presence';epoch:string;counter:number;baseSeq:number;cursor:[number,number]|null;tool:string;
  stroke:{id:string;part:number;points:number[];ended:boolean}|null;view:{target:[number,number,number];distance:number;yaw:number;pitch:number}};
export function presence(counter:number):Presence{return {kind:'presence',epoch:'join-2',counter,baseSeq:10000,cursor:[384,640],tool:'quake',
  stroke:{id:'s7',part:counter,points:[380,638,382,639,384,640],ended:false},view:{target:[96,160,8],distance:80,yaw:1.25,pitch:.8}};}
