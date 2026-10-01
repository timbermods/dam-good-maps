import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deps, HERE, ROOT, LOCAL, json, hash } from './common.mjs';
const esbuild = deps('esbuild');
mkdirSync(LOCAL, {recursive:true});
const variants = ['baseline', ...(existsSync(resolve(HERE, 'water.ts')) ? ['fast'] : [])];
const manifest = {base:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:ROOT, encoding:'utf8'}).trim(), node:process.version, esbuild:esbuild.version, variants:{}};
for (const variant of variants) {
  const result = await esbuild.build({
    absWorkingDir:HERE, entryPoints:['api.ts'], outfile:resolve(LOCAL, variant + '.cjs'),
    bundle:true, platform:'node', format:'cjs', target:'es2022', minify:false,
    nodePaths:[dirname(deps.resolve('typescript/package.json')) + '/..'], metafile:true,
    plugins:[{name:'investigation-only', setup(build) {
      if (variant === 'fast') build.onResolve({filter:/water$/}, args => {
        const target = resolve(args.resolveDir, args.path);
        if (target === resolve(ROOT, 'src/core/sim/water')) return {path:resolve(HERE, 'water.ts')};
      });
    }}],
  });
  const sources = {};
  for (const p of Object.keys(result.metafile.inputs).sort()) sources[p] = hash(readFileSync(resolve(HERE, p)));
  manifest.variants[variant] = {bundle:hash(readFileSync(resolve(LOCAL, variant+'.cjs'))), sources};
  console.log('built', variant, Object.keys(sources).length, 'modules');
}
json(resolve(LOCAL, 'build.json'), manifest);
