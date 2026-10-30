import {Gzip,Gunzip} from "fflate";

const CHUNK=32*1024,encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
/** JSON's order/spelling, emitted in bounded pieces. No stringify of the document or an array. */
function* tokens(v: unknown): Generator<string> {
  if(v===null){yield "null";return;}
  if(typeof v==="string") {
    yield '"';
    for(let at=0;at<v.length;){let end=Math.min(v.length,at+CHUNK);const c=v.charCodeAt(end-1);if(end<v.length&&c>=0xd800&&c<=0xdbff)end--;
      yield JSON.stringify(v.slice(at,end)).slice(1,-1);at=end;}
    yield '"';return;
  }
  if(typeof v==="number"){if(!Number.isFinite(v))throw Error("nonfinite project number");yield JSON.stringify(v);return;}
  if(typeof v==="boolean"){yield String(v);return;}
  if(Array.isArray(v)){yield "[";for(let i=0;i<v.length;i++){if(i)yield ",";yield* tokens(v[i]===undefined?null:v[i]);}yield "]";return;}
  if(v&&typeof v==="object") {
    yield "{";let first=true;
    for(const key of Object.keys(v)){const x=(v as Record<string,unknown>)[key];if(x===undefined)continue;if(!first)yield ",";first=false;yield* tokens(key);yield ":";yield* tokens(x);}yield "}";return;
  }
  throw Error("unsupported project value");
}
export function* projectJsonChunks(doc: unknown): Generator<Uint8Array> {
  let pending="";
  for(const t of tokens(doc)){
    if(pending.length+t.length>CHUNK&&pending){yield encoder.encode(pending);pending="";}
    if(t.length>CHUNK){yield encoder.encode(t);}else pending+=t;
  }
  if(pending)yield encoder.encode(pending);
}
/** Sink can write directly to a file/OPFS; awaiting every write provides backpressure. */
export async function writeProject(doc: unknown, sink: (b: Uint8Array)=>Promise<void>,level=9): Promise<void> {
  let output:Uint8Array[]=[];
  const gzip=new Gzip({level:level as 9,mtime:0},b=>output.push(b));
  for(const b of projectJsonChunks(doc)){gzip.push(b,false);for(const x of output)await sink(x);output=[];}
  gzip.push(new Uint8Array(),true);for(const x of output)await sink(x);
}

type Frame={value:any;kind:"object"|"array";phase:"key"|"colon"|"value"|"comma";key?:string;empty:boolean};
/** Incremental JSON grammar. Only the current scalar and final data model are retained. */
export class ProjectJsonParser {
  private stack:Frame[]=[];private root:unknown;private rootSet=false;
  private mode:"none"|"string"|"escape"|"unicode"|"number"|"literal"="none";
  private scalar="";private pieces:string[]=[];private unicode="";private isKey=false;
  private characters:string[]=[];private characterCount=0;
  maxInputChars=0;maxScalarPieceChars=0;
  private bad():never {throw Error("invalid project JSON");}
  private append(s:string):void {this.characters.push(s);this.characterCount+=s.length;this.maxScalarPieceChars=Math.max(this.maxScalarPieceChars,this.characterCount);if(this.characterCount>=CHUNK){this.pieces.push(this.characters.join(""));this.characters=[];this.characterCount=0;}}
  private value(v:unknown):void {
    const f=this.stack.at(-1);
    if(!f){if(this.rootSet)this.bad();this.root=v;this.rootSet=true;return;}
    if(f.phase!=="value")this.bad();
    if(f.kind==="array")f.value.push(v);else Object.defineProperty(f.value,f.key!,{value:v,enumerable:true,writable:true,configurable:true});
    f.phase="comma";f.empty=false;
  }
  push(text:string):void {
    this.maxInputChars=Math.max(this.maxInputChars,text.length);
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(this.mode==="string") {if(c==='"') {const end=this.characters.join(""),s=this.pieces.length?[...this.pieces,end].join(""):end;this.characters=[];this.characterCount=0;this.pieces=[];this.scalar="";this.mode="none";if(this.isKey){const f=this.stack.at(-1)!;f.key=s;f.phase="colon";}else this.value(s);}else if(c==='\\')this.mode="escape";else {if(c.charCodeAt(0)<32)this.bad();this.append(c);}continue;}
      if(this.mode==="escape") {if(c==='u'){this.unicode="";this.mode="unicode";}else {const e:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!(c in e))this.bad();this.append(e[c]);this.mode="string";}continue;}
      if(this.mode==="unicode"){if(!/[0-9a-f]/i.test(c))this.bad();this.unicode+=c;if(this.unicode.length===4){this.append(String.fromCharCode(parseInt(this.unicode,16)));this.mode="string";}continue;}
      if(this.mode==="number"||this.mode==="literal") {
        if(/[0-9eE+.\-]/.test(c)&&this.mode==="number"||/[a-z]/.test(c)&&this.mode==="literal"){this.scalar+=c;if(this.scalar.length>128)this.bad();continue;}
        this.finishScalar();i--;continue;
      }
      if(/\s/.test(c)){if(!/[\t\r\n ]/.test(c))this.bad();continue;}
      const f=this.stack.at(-1);
      if(f?.phase==="colon"){if(c!==':')this.bad();f.phase="value";continue;}
      if(f?.phase==="comma") {if(c===','){f.phase=f.kind==="object"?"key":"value";continue;}if(c===(f.kind==="object"?'}':']')){this.stack.pop();continue;}this.bad();}
      if(f&&c===(f.kind==="object"?'}':']')){if(!f.empty)this.bad();this.stack.pop();continue;}
      if(c==='"'){this.isKey=f?.phase==="key";this.mode="string";this.scalar="";continue;}
      if(f?.phase==="key")this.bad();
      if(c==='{'||c==='['){const v=c==='{'?{}:[];this.value(v);this.stack.push({value:v,kind:c==='{'?"object":"array",phase:c==='{'?"key":"value",empty:true});if(this.stack.length>512)this.bad();continue;}
      if(c==='-'||/[0-9]/.test(c)){this.mode="number";this.scalar=c;continue;}
      if(/[tfn]/.test(c)){this.mode="literal";this.scalar=c;continue;}
      this.bad();
    }
  }
  private finishScalar():void {let v:unknown;try{v=JSON.parse(this.scalar);}catch{this.bad();}if(typeof v==='number'&&!Number.isFinite(v))this.bad();this.mode="none";this.scalar="";this.value(v);}
  finish():unknown {if(this.mode==="number"||this.mode==="literal")this.finishScalar();if(this.mode!=="none"||this.stack.length||!this.rootSet)this.bad();return this.root;}
}
/** Streaming decompression and fatal UTF-8 decoding; never gunzipSync/JSON.parse on a whole file. */
export async function readProject(source:AsyncIterable<Uint8Array>|Iterable<Uint8Array>):Promise<unknown> {
  const parser=new ProjectJsonParser(),utf8=new TextDecoder("utf-8",{fatal:true});
  let gunzip:Gunzip|undefined,header=new Uint8Array(),tail=new Uint8Array(),crc=0xffffffff,length=0;
  const parse=(b:Uint8Array)=>{if(gunzip){for(const x of b)crc=crcTable[(crc^x)&255]^(crc>>>8);length=(length+b.length)>>>0;}for(let at=0;at<b.length;at+=CHUNK)parser.push(utf8.decode(b.subarray(at,at+CHUNK),{stream:true}));};
  for await(const input of source){ // split compressed inputs too, bounding one inflater callback
    const t=new Uint8Array(Math.min(8,tail.length+input.length));if(input.length>=8)t.set(input.subarray(input.length-8));else {const old=Math.min(t.length-input.length,tail.length);t.set(tail.subarray(tail.length-old));t.set(input,old);}tail=t;
    for(let at=0;at<input.length;at+=CHUNK){let b=input.subarray(at,at+CHUNK);
      if(header.length<2&&!gunzip){const joined=new Uint8Array(header.length+b.length);joined.set(header);joined.set(b,header.length);header=joined;if(header.length<2)continue;
        if(header[0]===0x1f&&header[1]===0x8b)gunzip=new Gunzip(parse);else gunzip=undefined;b=header;header=new Uint8Array(2);}
      if(gunzip)gunzip.push(b,false);else parse(b);
    }
  }
  if(header.length<2)parse(header);if(gunzip){gunzip.push(new Uint8Array(),true);if(tail.length!==8)throw Error("truncated project gzip");const v=new DataView(tail.buffer,tail.byteOffset,8);if(v.getUint32(0,true)!==(crc^0xffffffff)>>>0||v.getUint32(4,true)!==length)throw Error("project gzip checksum/length mismatch");}parser.push(utf8.decode());return parser.finish();
}
