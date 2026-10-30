/** Bounded binary records for inverse changes. String IDs remove repeated paths/property
 * names, UTF-16 preserves every code unit, and byte runs avoid base64 expansion. */
export class PatchRecordWriter {
 private strings=new Map<string,number>();
 private scratch=new Uint8Array(65536);
 encode(value:any):Uint8Array {
  const bytes=this.scratch,view=new DataView(bytes.buffer),added:string[]=[];let at=0;
  const byte=(v:number)=>{if(at===bytes.length)throw Error('patch record bound');bytes[at++]=v;};
  const uint=(v:number)=>{if(!Number.isSafeInteger(v)||v<0)throw Error('invalid patch integer');while(v>=128){byte(v%128+128);v=Math.floor(v/128);}byte(v);};
  const put=(v:any):void=>{
   if(v===undefined){byte(0);return;}if(v===null){byte(1);return;}if(v===false){byte(2);return;}if(v===true){byte(3);return;}
   if(typeof v==='number'){if(Number.isSafeInteger(v)&&!Object.is(v,-0)){byte(v>=0?4:5);uint(v>=0?v:-v-1);}else{byte(6);if(at+8>bytes.length)throw Error('patch record bound');view.setFloat64(at,v,true);at+=8;}return;}
   if(typeof v==='string'){
    if(/^(0|[1-9][0-9]*)$/.test(v)&&Number(v)<=0xffffffff){byte(12);uint(Number(v));return;}
    const known=this.strings.get(v);if(known!==undefined){byte(8);uint(known);return;}
    this.strings.set(v,this.strings.size);added.push(v);let ascii=true;for(let i=0;i<v.length;i++)if(v.charCodeAt(i)>127){ascii=false;break;}byte(ascii?13:7);uint(v.length);for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);byte(c&255);if(!ascii)byte(c>>>8);}return;
   }
   if(v instanceof Uint8Array){byte(11);uint(v.length);if(at+v.length>bytes.length)throw Error('patch record bound');bytes.set(v,at);at+=v.length;return;}
   if(Array.isArray(v)){byte(9);uint(v.length);for(const x of v)put(x);return;}
   if(typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype){const keys=Object.keys(v);byte(10);uint(keys.length);for(const k of keys){put(k);put(v[k]);}return;}
   throw Error('unsupported patch record value');
  };try{put(value);return bytes.slice(0,at);}catch(error){for(const s of added)this.strings.delete(s);throw error;}
 }
}
export class PatchRecordReader {
 private strings:string[]=[];
 decode(bytes:Uint8Array):any {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
  const byte=()=>{if(at===bytes.length)throw Error('truncated patch record');return bytes[at++];};
  const uint=()=>{let value=0,scale=1;for(let i=0;i<8;i++){const b=byte();value+=(b&127)*scale;if(!Number.isSafeInteger(value))throw Error('invalid patch integer');if(b<128)return value;scale*=128;}throw Error('invalid patch integer');};
  const get=(depth=0):any=>{if(depth>128)throw Error('patch record depth');const tag=byte();
   if(tag===0)return undefined;if(tag===1)return null;if(tag===2)return false;if(tag===3)return true;
   if(tag===4)return uint();if(tag===5)return -uint()-1;
   if(tag===6){if(at+8>bytes.length)throw Error('truncated patch float');const v=view.getFloat64(at,true);at+=8;return v;}
   if(tag===7||tag===13){const n=uint();if(n*(tag===7?2:1)>bytes.length-at)throw Error('truncated patch string');let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(tag===7?byte()|byte()<<8:byte());this.strings.push(s);return s;}
   if(tag===8){const id=uint();if(id>=this.strings.length)throw Error('invalid patch string reference');return this.strings[id];}
   if(tag===12)return String(uint());
   if(tag===11){const n=uint();if(n>bytes.length-at)throw Error('truncated patch bytes');const v=bytes.slice(at,at+n);at+=n;return v;}
   if(tag===9){const n=uint();if(n>65536)throw Error('patch array bound');const out=[];for(let i=0;i<n;i++)out.push(get(depth+1));return out;}
   if(tag===10){const n=uint();if(n>65536)throw Error('patch object bound');const out={};for(let i=0;i<n;i++){const k=get(depth+1);if(typeof k!=='string')throw Error('invalid patch property');Object.defineProperty(out,k,{value:get(depth+1),enumerable:true,writable:true,configurable:true});}return out;}
   throw Error('unknown patch record type');
  };const result=get();if(at!==bytes.length)throw Error('trailing patch record');return result;
 }
}
