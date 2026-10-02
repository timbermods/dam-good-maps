// Keep fflate's Deflate expressions and entry order; supply its portable memory decision explicitly.
import {gzipSync as nativeGzip,zipSync as nativeZip,zlibSync as nativeZlib,type GzipOptions,type ZipOptions,type ZlibOptions,type Zippable} from 'fflate';
import {log} from './portable';
export function memoryFor(length:number): NonNullable<ZipOptions['mem']> {
  return (Math.ceil(Math.max(8,Math.min(13,log(length)))*1.5)-12) as NonNullable<ZipOptions['mem']>;
}
const lengthWithDictionary=(data:Uint8Array,options:ZipOptions)=>data.length+Math.min(32768,options.dictionary?.length??0);
export function gzipSync(data:Uint8Array,options:GzipOptions={}):Uint8Array {
  return nativeGzip(data,{...options,mem:options.mem??memoryFor(lengthWithDictionary(data,options))});
}
export function zlibSync(data:Uint8Array,options:ZlibOptions={}):Uint8Array {
  return nativeZlib(data,{...options,mem:options.mem??memoryFor(lengthWithDictionary(data,options))});
}
function entries(tree:Zippable,inherited:ZipOptions):Zippable {
  const out:Zippable={};
  for(const [name,value]of Object.entries(tree)){
    const data=Array.isArray(value)?value[0]:value,options={...inherited,...(Array.isArray(value)?value[1]:{})};
    out[name]=data instanceof Uint8Array?[data,{...options,mem:options.mem??memoryFor(lengthWithDictionary(data,options))}]:[entries(data as Zippable,options),{...options,mem:options.mem??memoryFor(0)}];
  }
  return out;
}
export function zipSync(data:Zippable,options:ZipOptions={}):Uint8Array {
  return nativeZip(entries(data,options),{...options,mem:options.mem??memoryFor(0)});
}
