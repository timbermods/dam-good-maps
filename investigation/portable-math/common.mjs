import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../..'),LOCAL=resolve(HERE,'local');
mkdirSync(LOCAL,{recursive:true});
export const deps=createRequire(resolve(process.env.DGM_DEPS??resolve(LOCAL,'runtime'),'package.json'));
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const json=(name,data)=>writeFileSync(resolve(LOCAL,name),JSON.stringify(data,null,2)+'\n');
export function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(resolve(dir,d.name)):/\.[cm]?[jt]sx?$/.test(d.name)?[resolve(dir,d.name)]:[]).sort();}
