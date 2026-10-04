import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,deps} from './common.mjs';
writeFileSync(resolve(LOCAL,'shared-kernel.ts'),readFileSync(resolve(HERE,'shared-kernel-template.ts')));
for(const name of ['shared-helper','parallel-coordinator'])await deps('esbuild').build({entryPoints:[resolve(name==='shared-helper'?LOCAL:HERE,name+'.ts')],outfile:resolve(LOCAL,name+'.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
