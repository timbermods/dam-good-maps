import {build} from 'esbuild';
import {resolve} from 'node:path';
import {dir,root,plugin,helpers} from './overlay.mjs';
helpers();
for(const phase of ['before','after'])await build({entryPoints:[resolve(dir,'library.ts')],outfile:resolve(dir,'../local/round2',phase+'.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',alias:{'product-crater':resolve(root,'src/core/forces/craterize.ts'),'product-erupt':resolve(root,'src/core/forces/erupt.ts'),'product-quake':resolve(root,'src/core/forces/quake.ts'),'product-glaciate':resolve(root,'src/core/forces/glaciate/model.ts'),'product-carve':resolve(root,'src/core/forces/carve/run.ts'),'product-history':resolve(root,'src/core/doc/gestureHistory.ts'),'product-session':resolve(root,'src/core/doc/session.ts'),'product-document':resolve(root,'src/core/doc/document.ts'),'product-stream':resolve(root,'src/core/doc/projectStream.ts'),'product-cache':resolve(root,'src/core/doc/resultStore.ts'),'product-defaults':resolve(root,'src/core/forces/nature.ts')},plugins:[await plugin(phase)]});
console.log('Both deterministic source overlays built; tracked product files untouched.');
