import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const HERE=dirname(fileURLToPath(import.meta.url)), ROOT=resolve(HERE,'../..'), LOCAL=resolve(HERE,'local');
mkdirSync(LOCAL,{recursive:true});
// Existing pinned runtime, or an isolated installation selected by DGM_DEPS.
const runtime=process.env.DGM_DEPS ?? ROOT;
export const deps=createRequire(resolve(runtime,'package.json'));
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const json=(name,data)=>writeFileSync(resolve(LOCAL,name),JSON.stringify(data,null,2)+'\n');
