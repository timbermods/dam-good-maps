// Same in-process TypeScript loader as investigation/probe/run.cjs, with explicit,
// fail-closed substitutions in memory. No product file is written.
const fs=require('node:fs'), path=require('node:path'), Module=require('node:module');
process.env.NODE_PATH=[path.join(__dirname,'local/node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const ts=require('typescript');
const mode=process.env.DELTA_MODE||'after';
function once(source, from, to) {
  if(source.split(from).length!==2)throw Error('M9b integration point changed: '+from);
  return source.replace(from,to);
}
function overlay(source) {
    source='import { deltaField, deltaHydro, deltaBadwaterKeep } from "../../../investigation/delta/prototype";\n'+source;
    source=once(source,'const F = makeField(g, seed, W, H);','const F = specIn.theme === "delta" && !opts.context ? deltaField(g, seed, W, H) : makeField(g, seed, W, H);');
    source=once(source,'const hy = planHydro(land.E, h, g, seed, W, H, attempt, { protect });','const hy = g.theme === "delta" && !ctx ? deltaHydro(h, g, seed, W, H) : planHydro(land.E, h, g, seed, W, H, attempt, { protect });');
    source=once(source,'// (the mine sites\' squares, found or padded as the land was shaped, D363: the hollows keep off them)','if (shown.theme === "delta" && !ctx) badAsk.keepOff = deltaBadwaterKeep(h, hy.water, W, H, badAsk.keepOff);\n  // (the mine sites\' squares, found or padded as the land was shaped, D363: the hollows keep off them)');
    // The initial badwater hollows are land shaping too: include them in the first look.
    // Keep M9b's hLand retry base intact; only move the callback, never rewrite a shown field.
    source=once(source,'opts.onLand?.({ attempt, heights: hLand, water: hy.water });','if (shown.theme !== "delta" || ctx) opts.onLand?.({ attempt, heights: hLand, water: hy.water });');
    source=once(source,'} else if (guess && badAsk.count > 0) bad = badAt(est, guess, 0);','} else if (guess && badAsk.count > 0) bad = badAt(est, guess, 0);\n    if (!from && shown.theme === "delta" && !ctx) { firstLook = Math.round(performance.now() - t0); landStage!.firstLook = firstLook; opts.onLand?.({ attempt, heights: h.slice(), water: hy.water }); }');
    // The settled-start distance preference must not relocate already displayed hollows.
    // Delta's shoulder mask separates them from the plain; all blocking checks still run.
    source=once(source,'if (bad.features.length && !lastAttempt) {','if (bad.features.length && !lastAttempt && (shown.theme !== "delta" || ctx)) {');
  return source;
}
module.exports={overlay};
require.extensions['.ts']=(mod,file)=>{
  let source=fs.readFileSync(file,'utf8');
  const generator=file.replaceAll('\\','/').endsWith('/src/core/gen/generate.ts');
  if(generator && mode==='after') source=overlay(source);
  mod._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true},fileName:file}).outputText,file);
  if(generator && process.env.DELTA_CAPTURE) {
    const generate=mod.exports.generate;
    mod.exports.generate=(spec,opts)=>{
      let shown;
      const r=generate(spec,{...opts,onLand:l=>{shown??=l.heights.slice();opts?.onLand?.(l);}}), b=r.built;
      const dir=path.join(__dirname,'local',process.env.DELTA_OUTPUT||mode);fs.mkdirSync(dir,{recursive:true});
      const changes=[];if(shown)for(let i=0;i<shown.length;i++)if(shown[i]!==b.heights[i])changes.push({i,from:shown[i],to:b.heights[i]});
      fs.writeFileSync(path.join(dir,`${b.W}-${spec.seed}.json`),JSON.stringify({W:b.W,H:b.H,heights:Array.from(b.heights),water:Array.from(b.water),contamination:Array.from(b.contamination),moisture:Array.from(b.moisture),start:b.start,entities:b.entities,checks:r.report.checks,info:r.info,settled:b.settle.settled,features:r.features,changes}));
      if(r.bytes.length)fs.writeFileSync(path.join(dir,`${b.W}-${spec.seed}.timber`),r.bytes);
      return r;
    };
  }
};
if(require.main===module) {
  const entry=path.resolve(__dirname,process.argv[2]||'check.ts');
  process.argv.splice(1,1);require(entry);
}
