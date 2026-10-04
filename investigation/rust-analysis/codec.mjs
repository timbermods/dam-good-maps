// Lossless JSON transport, including typed-array bytes, infinities, -0 and undefined.
export function pack(value){
 if(value===undefined)return {$undefined:true};
 if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:String(Object.is(value,-0)?'-0':value)};
 if(ArrayBuffer.isView(value)){const b=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return {$array:value.constructor.name,base64:btoa(s)};}
 if(Array.isArray(value))return value.map(pack);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v)]));return value;
}
export function unpack(value){
 if(value&&typeof value==='object'){
 if(value.$undefined)return undefined;if(value.$number)return value.$number==='-0'?-0:Number(value.$number);
 if(value.$array){const s=atob(value.base64),b=Uint8Array.from(s,c=>c.charCodeAt(0));const ctor=globalThis[value.$array]??(value.$array==='Buffer'?Uint8Array:null);if(!ctor)throw Error('Unknown typed array '+value.$array);return new ctor(b.buffer);}
 if(Array.isArray(value))return value.map(unpack);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));}return value;
}
export const exact=value=>JSON.stringify(pack(value));
export function untimed(m){const r=structuredClone(m);delete r.ms;delete r.cpu;if(r.spent)for(const s of r.spent)delete s.ms;return r;}
