// These same insertions produce adoption.patch. Fail closed if the base moved.
const path=require('node:path');
function replace(source,from,to) {
  if(source.split(from).length!==2) throw Error(`Overlay anchor moved: ${from.slice(0,70)}`);
  return source.replace(from,to);
}
exports.overlay=(source,adoption=false)=>{
  const modulePath=adoption?'../land/archipelago':path.join(__dirname,'archipelago.ts').replaceAll('\\','/');
  source=`import { islandStage, islandStartAvoid, enableIslandPrototype, islandPrototypeEnabled } from ${JSON.stringify(modulePath)};\n`+source;
  source=replace(source,'const F = makeField(g, seed, W, H);','const F = !opts.context && enableIslandPrototype(g, specIn) ? { E: new Float64Array(W * H), hard: new Float64Array(W * H) } : makeField(g, seed, W, H);');
  source=replace(source,'  const g = land.g;\n  const N = W * H;\n  const h = land.h0.slice();','  const g = land.g;\n  if (islandPrototypeEnabled(g) && !ctx) return islandStage(g, seed, W, H, attempt);\n  const N = W * H;\n  const h = land.h0.slice();');
  source=replace(source,'    const model = waterModel(W, H, h, []);\n    const kept = policy', '    avoid = islandStartAvoid(g, avoid);\n    const model = waterModel(W, H, h, []);\n    const kept = policy');
  return source;
};
exports.extras=source=>replace(source,'    for (let i = 0; i < N; i++) if (m[i]) blocked[i] = 1;',
  '    for (let i = 0; i < N; i++) if (m[i] && (spec.theme !== "islands" || !f.params.natural || b.water[i] > WET)) blocked[i] = 1;');
// Kyler's follow-up: the per-theme cap is adopted by M9b separately, not in this patch.
exports.cap=source=>replace(source,'maxWaterShare: spec && (spec.theme === "lakeBasin" || spec.theme === "islands" || spec.theme === "any") ? 0.55 : 0.35,',
  'maxWaterShare: spec?.theme === "islands" ? 0.70 : spec && (spec.theme === "lakeBasin" || spec.theme === "any") ? 0.55 : 0.35,');
