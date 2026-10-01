import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=process.env.COLLAB_RUNTIME || path.join(here,'local/runtime/node_modules');
const require=createRequire(path.join(runtime,'_resolver.cjs'));
const {build}=require('esbuild');
await fs.mkdir(path.join(here,'local'),{recursive:true});
const entry=process.argv.includes('--safety')?'safety':'check';
await build({entryPoints:[path.join(here,`${entry}.ts`)],outfile:path.join(here,`local/${entry}.mjs`),bundle:true,platform:'node',format:'esm',target:'node22',
  nodePaths:[runtime],sourcemap:true});
await import(`./local/${entry}.mjs`);
