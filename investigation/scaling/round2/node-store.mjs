import {openSync,writeSync,readSync,closeSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export class FileResults {
 constructor(path){mkdirSync(dirname(path),{recursive:true});this.fd=openSync(path,'w+');this.offsets=new Map();this.end=0;}
 put(key,bytes){const at=this.end;let n=0;while(n<bytes.length)n+=writeSync(this.fd,bytes,n,bytes.length-n,at+n);this.offsets.set(key,[at,n]);this.end+=n;}
 get(key){const [at,len]=this.offsets.get(key)??[];if(len===undefined)throw Error('missing result cache');const b=new Uint8Array(len);let n=0;while(n<len){const got=readSync(this.fd,b,n,len-n,at+n);if(!got)throw Error('truncated result cache');n+=got;}return b;}
 close(){closeSync(this.fd);}
}
