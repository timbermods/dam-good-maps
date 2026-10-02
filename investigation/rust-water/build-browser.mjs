import {resolve} from 'node:path';
import {HERE,LOCAL,deps} from './common.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'coordinator.ts')],outfile:resolve(LOCAL,'coordinator.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
