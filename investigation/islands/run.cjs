// Read-only overlay: product sources are transpiled in memory; measures.ts is unmodified.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const runtime = process.env.ISLANDS_RUNTIME || path.resolve(__dirname, 'local/runtime/node_modules');
process.env.NODE_PATH = [runtime, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const ts = require('typescript');
const mode = process.argv[2];
if (!['before', 'after'].includes(mode)) throw Error('run.cjs before|after [measures arguments]');
process.argv.splice(2, 1);
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  const generator = file === path.join(root, 'src/core/gen/generate.ts');
  // Relocate only the probe's generated model cache; its measures and model math stay unchanged.
  if(file===path.join(root,'investigation/probe/runner/paths.ts')) source=source.replace(
    "export const CACHE = join(PROBE_DIR, '.cache');",
    `export const CACHE = ${JSON.stringify(path.join(__dirname,'local/cycle-cache'))};`);
  if(file===path.join(root,'investigation/probe/runner/model.ts')) source=source.replace(
    "'$1../../../../src/'",JSON.stringify('$1'+root.replaceAll('\\','/')+'/src/'));
  if (generator && mode === 'after') source = require('./overlay.cjs').overlay(source);
  if (mode === 'after' && !process.env.ISLANDS_ADOPTION_ONLY && file === path.join(root,'src/core/gen/extras.ts')) source=require('./overlay.cjs').extras(source);
  if (mode === 'after' && !process.env.ISLANDS_ADOPTION_ONLY && file === path.join(root,'src/core/validate/playability.ts')) source=require('./overlay.cjs').cap(source);
  const compiled = ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    esModuleInterop: true, resolveJsonModule: true,
  }, fileName: file});
  mod._compile(compiled.outputText, file);
  if (generator) {
    const generate = mod.exports.generate;
    mod.exports.generate = (spec, options) => {
      const r = generate(spec, {...options, ...(process.env.ISLANDS_DEBUG ? {
        maxAttempts:2,
        onProgress:p=>console.error(JSON.stringify(p)),
        onAttempt:a=>console.error(`attempt ${a.attempt}: ${a.result.info.stage}`),
      } : {})});
      if(process.env.ISLANDS_NO_CAPTURE) return r;
      const dir = path.join(__dirname, 'local', mode);
      fs.mkdirSync(dir, {recursive: true});
      const b = r.built;
      if(process.env.ISLANDS_DEBUG) {
        const hist={};
        for(let i=0;i<b.W*b.H;i++) {const k=`${b.heights[i]}:${b.water[i]>0.05?'wet':'dry'}`;hist[k]=(hist[k]||0)+1;}
        console.error(JSON.stringify({hist,start:b.start,features:r.features.filter(f=>f.kind==='start')}));
        fs.writeFileSync(path.join(dir,`${spec.size.x}-${spec.seed}-terrain.json`),JSON.stringify({W:b.W,H:b.H,h:Array.from(b.heights),d:Array.from(b.water)}));
      }
      const { shadeTiles } = require(path.join(root, 'src/core/render/shade.ts'));
      const { encodePng } = require(path.join(root, 'tools/png.ts'));
      const rgb = shadeTiles(b.heights, b.W, b.H, b.water);
      const img = new Uint8Array(rgb.length);
      for (let y = 0; y < b.H; y++) img.set(rgb.subarray(y*b.W*3, (y+1)*b.W*3), (b.H-1-y)*b.W*3);
      if (b.start) for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
        const x=b.start.x+dx, y=b.start.y+dy;
        if (x<0||y<0||x>=b.W||y>=b.H) continue;
        const k=((b.H-1-y)*b.W+x)*3;
        img[k]=255; img[k+1]=Math.max(Math.abs(dx),Math.abs(dy))===2?255:40; img[k+2]=40;
      }
      const name = `${spec.size.x}-${spec.seed}`;
      fs.writeFileSync(path.join(dir, `${name}.png`), encodePng(img,b.W,b.H));
      fs.writeFileSync(path.join(dir, `${name}-checks.json`), JSON.stringify({
        checks:r.report.checks, intentions:r.intentions, info:r.info,
        settle:{ticks:b.settle.ticks, settled:b.settle.settled},
      }));
      if (process.env.ISLANDS_SAVE) fs.writeFileSync(path.join(dir, `${name}.timber`),r.bytes);
      return r;
    };
  }
};
const entryIndex=process.argv.indexOf('--entry');
require(entryIndex>=0 ? path.join(__dirname,process.argv[entryIndex+1]) : path.join(root,'investigation/m9b/measures.ts'));
