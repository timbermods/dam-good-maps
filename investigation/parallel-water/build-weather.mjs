import {resolve,dirname} from 'node:path';
import {deps,HERE,LOCAL} from './common.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'weather-coordinator.ts')],outfile:resolve(LOCAL,'weather-coordinator.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[resolve(dirname(deps.resolve('fflate/package.json')),'..')]});
console.log('Built ordered-frame Weather oracle');
