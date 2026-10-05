import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const root=resolve('investigation/gen-speed/overlay/src/core');
function edit(file,fn){const out=resolve(root,file);mkdirSync(dirname(out),{recursive:true});let s=readFileSync(resolve('src/core',file),'utf8').replaceAll('\r\n','\n');s=fn(s);writeFileSync(out,s);}
function replace(s,a,b){if(!s.includes(a))throw Error('missing edit '+a.slice(0,90));return s.replace(a,b);}
edit('gen/generate.ts',s=>{
 s=replace(s,'buildMap, SettleCache','buildMap, rebuild as rebuildMap, SettleCache');
 s=replace(s,'import { droughtStorage }','import { droughtStorage, prepareDrought }');
 s=replace(s,'  const build = (features: readonly Feature[], stop:', '  // Reuse the build pipeline\'s guarded terrain, slopes, water, soil and resource caches.\n  // Each input owns a field snapshot; speculative builds may also be the previous build.\n  let previousBuild: BuildResult | null = null;\n  const build = (features: readonly Feature[], stop:');
 s=replace(s,'    const b = buildMap({ W, H, seed, features, field: fieldOf() }, { settleCache: cache, fieldCache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });',`    const input = { W, H, seed, features, field: fieldOf() };
    const options = { settleCache: cache, fieldCache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) };
    const b = previousBuild ? rebuildMap(previousBuild, input, options) : buildMap(input, options);
    // Generation returns a complete map; editor dirty regions are not part of its result.
    b.dirty = null;
    previousBuild = b;`);
 s=replace(s,'      const kept = droughtStorage(model, D, FIRST_DROUGHT_DAYS);\n      const storage = { kept: droughtStorage(model, D, DROUGHT[spec.designedFor].days)', '      const drought = prepareDrought(model, D);\n      const kept = drought(FIRST_DROUGHT_DAYS);\n      const storage = { kept: drought(DROUGHT[spec.designedFor].days)');
 return s;
});
edit('sim/drought.ts',s=>{
 s=replace(s,'  const { W, H } = m;',`  return prepareDrought(m, depth)(days);
}

/** Snapshot the spill levels, pools and evaporation once for several drought lengths.
 *  The returned function owns its inputs and gives each caller a fresh depth array.
 *  Keep the evaporation sum, division, multiplication and subtraction in their original order. */
export function prepareDrought(m: WaterModel, depth: ArrayLike<number>): (days: number) => Float64Array {
  const { W, H } = m;`);
 s=replace(s,'  for (let i = 0; i < N; i++) {\n    if (label[i] < 0) continue;\n    const drop = (evap[label[i]] / area[label[i]]) * days;\n    const k = kept[i] - drop;\n    kept[i] = k > 0 ? k : 0;\n  }\n  return kept;',`  return (days) => {
    const out = kept.slice();
    for (let i = 0; i < N; i++) {
      if (label[i] < 0) continue;
      const drop = (evap[label[i]] / area[label[i]]) * days;
      const k = out[i] - drop;
      out[i] = k > 0 ? k : 0;
    }
    return out;
  };`);
 return s;
});
edit('gen/settler.ts',s=>{
 s=replace(s,'x: number, y: number, rule: number): { moist: number; water: number }', 'x: number, y: number, rule: number, shores?: Uint8Array): { moist: number; water: number }');
 s=replace(s,'    const shore = pumpShores(h, D, C, W, H);','    const shore = shores ?? pumpShores(h, D, C, W, H);');
 s=replace(s,'  return { walk, walkAny, walkKept, dWet, boxSum, regions, dLake, dFall, dJoin, dSpring, medianLevel, margin, storeSum };',`  // Every candidate reads the same pump shores; compute only if a cross-level pick needs them.
  let shores: Uint8Array | null = null;
  const pumpShore = () => shores ??= pumpShores(h, D, water.contamination, W, H);
  return { walk, walkAny, walkKept, dWet, boxSum, regions, dLake, dFall, dJoin, dSpring, medianLevel, margin, storeSum, pumpShore };`);
 s=replace(s,'medianLevel, margin, storeSum } = opts.prepared','medianLevel, margin, storeSum, pumpShore } = opts.prepared');
 s=replace(s,'water.moisture, x, y, waterRule);','water.moisture, x, y, waterRule, c.sameLevel ? undefined : pumpShore());');
 return s;
});
edit('gen/intentions.ts',s=>replace(s,'  let res = ids.map((id) => ({ id, ...checkIntention(id, finalCtx(built, hy)) }));',`  // The intention checks only read the context; build the same drought and walk once.
  const ctx = ids.length ? finalCtx(built, hy) : null;
  let res = ids.map((id) => ({ id, ...checkIntention(id, ctx!) }));`));
edit('validate/playability.ts',s=>{
 s=replace(s,'  const shore = startWaterShore(walk, h, W, H, D, C, model.emitters, droughtStorage(model, D, rules.droughtDays), rules.waterWithin);',`  // Water, plants and storage read the same drought on the unchanged model and depth.
  const keptDrought = droughtStorage(model, D, rules.droughtDays);
  const shore = startWaterShore(walk, h, W, H, D, C, model.emitters, keptDrought, rules.waterWithin);`);
 s=s.replaceAll('const kept = droughtStorage(model, D, rules.droughtDays);','const kept = keptDrought;');return s;
});
edit('gen/resources.ts',s=>{
 s=replace(s,'  const patch = (seedTile:', '  // Both growers finish synchronously and retain only tile lists, not the allowed mask.\n  const growthAllowed = new Uint8Array(N);\n  const patch = (seedTile:');
 s=s.replace(/^    const allowed = new Uint8Array\(N\);$/gm,'    const allowed = growthAllowed;');return s;
});
