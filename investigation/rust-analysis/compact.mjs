import {readdirSync,readFileSync,writeFileSync,unlinkSync,existsSync,renameSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {gzipSync} from 'node:zlib';
import {LOCAL} from './common.mjs';
const dir=resolve(LOCAL,'cases');
for(const n of readdirSync(dir).filter(n=>n.endsWith('.meta.json')))for(const suffix of ['.in','.expected']){
 const path=resolve(dir,n.replace('.meta.json',suffix));if(!path.startsWith(dir+sep))throw Error('outside corpus');
 if(existsSync(path)){const bytes=readFileSync(path);writeFileSync(path+'.gz.tmp',gzipSync(bytes,{level:1}));renameSync(path+'.gz.tmp',path+'.gz');unlinkSync(path);}
}
console.log('Compressed completed cases');
