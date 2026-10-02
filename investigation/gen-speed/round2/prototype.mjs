import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir,root} from '../build.mjs';
const dest=resolve(dir,process.env.GEN_ROUND2_CANDIDATE??'round2/candidate');if(!dest.split(String.fromCharCode(92)).join('/').startsWith(dir.split(String.fromCharCode(92)).join('/')+'/'))throw Error('candidate must stay in investigation');mkdirSync(resolve(dest,'gen'),{recursive:true});mkdirSync(resolve(dest,'land'),{recursive:true});
const mode=process.argv[2]??'narrow-canyon-smallcanyon-priorcanyon3-mines-proof-smallproof-wide2-smallout-scoped-naturalflow-wetout-twopass-min1000-preflight-smallwide-smallready-flowonly-courseextra-lakecourse-cleanflow-freeze-portable';
let gen=readFileSync(resolve(dir,'candidate/gen/generate.ts'),'utf8');
function sub(a,b){if(!gen.includes(a))throw Error('missing prototype anchor: '+a.slice(0,100));gen=gen.replace(a,b);}
// Check the cheap outcome screen before the costly wall probes and start preparation.
const start=gen.indexOf('      {\n        const po = outcomesOf('),end=gen.indexOf('\n    }\n    let second:',start);
if(start<0||end<0)throw Error('screen block absent');
const screen=gen.slice(start,end);gen=gen.slice(0,start)+gen.slice(end);
sub('      // (with a margin: the settled water',screen+'\n      // (with a margin: the settled water');
if(mode.includes('narrow')){
 gen=gen.replace(screen,'      if (shown.theme === "canyon") '+screen.trim().replace('shown.theme === "any" || ',''));
 sub('\n    }\n    let second:','\n      if (shown.theme !== "canyon") '+screen.trim()+'\n    }\n    let second:');
}
if(mode.includes('adaptive'))sub('          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, false);',`          // Re-plan hydrology on the same expensive field when its channel can fix the promise.
          if (!keeps && shown.theme === "riverValley") g.hydro.floor *= 1.25;
          if (!keeps && shown.theme === "canyon") { g.hydro.incise += 1; g.hydro.floor *= 0.75; }
          if (!keeps && shown.theme === "lakeBasin") { g.troughs += 1; g.hydro.lakeBudget = Math.min(0.5, g.hydro.lakeBudget * 1.2); }
          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, shown.theme !== "highlands");`);
if(mode.includes('canyon'))sub('          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, false);',`          // A rejected Canyon course can be incised on the same shaped field.
          if (!keeps && shown.theme === "canyon") { g.hydro.incise += 1; g.hydro.floor *= 0.75; }
          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, shown.theme === "canyon");`);
if(mode.includes('smallcanyon')){
 gen=gen.replace('if (shown.theme === "canyon") {','if (shown.theme === "canyon" && N <= 128 * 128) {');
 gen=gen.replace('if (shown.theme !== "canyon") {','if (shown.theme !== "canyon" || N > 128 * 128) {');
}
if(mode.includes('priorcanyon2'))sub('      genomes++;','      // The large Canyon course starts deep enough, rather than redrawing for its promise.\n      if (specIn.theme === "canyon" && W > 128) g.hydro.incise += 2;\n      genomes++;');
if(mode.includes('priorcanyon3'))sub('      genomes++;','      // Reserve gorge depth in the initial plan.\n      if (specIn.theme === "canyon" && W > 128) g.hydro.incise += 3;\n      genomes++;');
if(mode.includes('fieldcanyon')){
 sub('interface Land {\n  g: Genome;','interface Land {\n  // One outcome-screen allowance per shaped field, including its replans.\n  screenRequired?: boolean;\n  screenCounted?: boolean;\n  g: Genome;');
 sub('        if (!lastAttempt && opts.screen !== false && screened.count < landScreen(W, H) && (!keeps || !po.story.readable)) {\n          screened.count++;',`        const required = N > 128 * 128 ? (land.screenRequired ??= screened.count < landScreen(W, H)) : screened.count < landScreen(W, H);
        if (!lastAttempt && opts.screen !== false && required && (!keeps || !po.story.readable)) {
          if (N <= 128 * 128 || !land.screenCounted) { screened.count++; land.screenCounted = true; }`);
 sub('g.hydro.floor *= 0.75;', 'if (N <= 128 * 128) g.hydro.floor *= 0.75;');
}
if(mode.includes('canyonfill')){
 sub('  screenCounted?: boolean;','  screenCounted?: boolean;\n  outcomeAdjusted?: boolean;');
 sub('g.hydro.incise += 1; if (N <= 128 * 128)', 'g.hydro.incise += 1; land.outcomeAdjusted = true; if (N <= 128 * 128)');
 sub('        const both = new Float64Array(N);',`        // A corrected course must carry its water on the actual pre-fill, with
        // enough gorge margin to survive the change from planned to settled water.
        if (N > 128 * 128 && shown.theme === "canyon" && land.outcomeAdjusted) {
          const po = outcomesOf({ spec: shown, built: { W, H, heights: h, water: Float64Array.from(pf), contamination: new Float64Array(N) }, features: rivers, intentions: [] });
          if (!PROMISES.canyon.holds(po.signature, Math.min(W, H), 1.3) || !po.story.readable) return fail("Canyon pre-fill outcome", null, false);
        }
        const both = new Float64Array(N);`);
}
if(mode.includes('strictcanyon')){
 sub('N > 128 * 128 ? (land.screenRequired ??= screened.count < landScreen(W, H)) : screened.count < landScreen(W, H)', 'N > 128 * 128 ? true : screened.count < landScreen(W, H)');
 sub('shown.theme === "canyon" && land.outcomeAdjusted', 'shown.theme === "canyon"');
}
if(mode.split('-').includes('two'))sub('const PREPARED_MORE = 2;','const PREPARED_MORE = 0;');
if(mode.includes('mines'))sub('      firstLook = Math.round(performance.now() - t0);',`      // Prove the exact object's reachable mine pair on the inexpensive pre-fill,
      // before committing terrain or spending a full settle on an impossible start.
      if (guess && !lastAttempt && N <= 96 * 96) {
        const layout = [...rivers, ...bad.features, startOf(guess)];
        const bw = build(layout, "water");
        const model = waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }));
        const pf = prefill(model);
        const pb = { ...bw, waterModel: model, water: pf.depth, contamination: pf.contamination } as BuildResult;
        const obj = planExtras({ spec, base: pb, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh }).filter(f => f.params.kind === "mineSite");
        const mb = build([...layout, ...obj], "water");
        const objs = mapObjects({ entities: mb.entities.map(entityJson) });
        const wet = Uint8Array.from(pf.depth, d => d > WET ? 1 : 0);
        if (!mb.start || minesReached(objs, W, H, colonyReach(W, H, mb.heights, wet, objs, mb.start)) < minesWanted(W, H)) return fail("mine pair (pre-fill)", null, true);
      }
      firstLook = Math.round(performance.now() - t0);`);
if(mode.includes('wide'))sub('hy.flowTotal, hy.lakes.map((l) => l.tiles));','hy.flowTotal * 1.25, hy.lakes.map((l) => l.tiles));');
if(mode.includes('wide2'))gen=gen.replace('hy.flowTotal * 1.25,','hy.flowTotal * 2,');
if(mode.includes('smallout'))sub('hy.flowTotal * 2, hy.lakes.map((l) => l.tiles));','hy.flowTotal * 2, hy.lakes.map((l) => l.tiles), W >= 256 ? 400 : 2500);');
if(mode.includes('scoped')){
 sub('ctx: PlanContext | null, protect: Uint8Array | null, opts: GenerateOptions): { h:', 'ctx: PlanContext | null, protect: Uint8Array | null, opts: GenerateOptions, wider: boolean): { h:');
 sub('planLandStage(land, attempt, W, H, seed, ctx, protect, opts);','planLandStage(land, attempt, W, H, seed, ctx, protect, opts, W >= 256 && (shown.theme === "riverValley" || shown.theme === "lakeBasin"));');
 sub('hy.flowTotal * 2, hy.lakes.map((l) => l.tiles), W >= 256 ? 400 : 2500);','hy.flowTotal * (wider ? 2 : 1), hy.lakes.map((l) => l.tiles), wider ? 400 : 2500);');
}
if(mode.includes('naturalflow'))sub('hy.flowTotal * (wider ? 2 : 1),','hy.flowTotal,');
if(mode.includes('wetout')){
 sub('hy.flowTotal, hy.lakes.map((l) => l.tiles), wider ? 400 : 2500);','hy.flowTotal, hy.lakes.map((l) => l.tiles), wider ? 400 : 2500, wider ? hy.water : null);');
 let levels=readFileSync(resolve(root,'src/core/land/levels.ts'),'utf8');
 levels=levels.replace('lakes: readonly (readonly number[])[] = [], minArea = 2500): number {','lakes: readonly (readonly number[])[] = [], minArea = 2500, wet: Uint8Array | null = null): number {');
 const anchor='if (b.tiles.length < (b.sheet ? minArea / 2 : minArea)) return;';
 if(!levels.includes(anchor))throw Error('wet outlet anchor absent');
 levels=levels.replace(anchor,anchor+'\n    // Only a basin the planned water reaches needs extra capacity.\n    if (wet && !b.tiles.some(i => wet[i] || (i % W > 0 && wet[i - 1]) || (i % W < W - 1 && wet[i + 1]) || (i >= W && wet[i - W]) || (i < N - W && wet[i + W]))) return;');
 if(mode.includes('twopass')){
  levels=levels.replace('minArea = 2500, wet: Uint8Array | null = null): number {','minArea = 2500, wet: Uint8Array | null = null, maxArea = Infinity): number {');
  levels=levels.replace(anchor,anchor+'\n    if (b.tiles.length >= (b.sheet ? maxArea / 2 : maxArea)) return;');
  const minimum=mode.includes('min1000')?1000:400;
  sub('    widenOutlets(h, W, H, heads, hash32(seed, "widen", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), wider ? 400 : 2500, wider ? hy.water : null);',`    widenOutlets(h, W, H, heads, hash32(seed, "widen", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles));\n    // Keep the existing large-basin cuts; add capacity only to smaller wet basins.\n    if (wider) widenOutlets(h, W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), ${minimum}, hy.water, 2500);`);
  if(mode.includes('keepcourse'))sub('    if (wider) widenOutlets(h, W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);',`    if (wider) {
      const courseKeep = heads.slice();
      for (let i = 0; i < N; i++) if (hy.water[i] === 1) {
        const x = i % W, y = (i - x) / W;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep[(y + dy) * W + x + dx] = 1;
      }
      widenOutlets(h, W, H, courseKeep, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);
    }`);
  if(mode.includes('course1'))sub('for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep', 'for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep');
  if(mode.includes('course0'))sub('for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep', 'for (let dy = 0; dy <= 0; dy++) for (let dx = 0; dx <= 0; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep');
  if(mode.includes('lakeshore')){
   sub('      const courseKeep = heads.slice();',`      const courseKeep = heads.slice();
      const lakeShore = new Uint8Array(N);
      for (const lake of hy.lakes) for (const i of lake.tiles) {
        const x = i % W, y = (i - x) / W;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) lakeShore[(y + dy) * W + x + dx] = 1;
      }`);
   sub('if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) courseKeep[(y + dy) * W + x + dx] = 1;', 'if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && !lakeShore[(y + dy) * W + x + dx]) courseKeep[(y + dy) * W + x + dx] = 1;');
  }
  if(mode.includes('safeoutlet')){
   sub('interface Land {\n  g: Genome;', 'interface Land {\n  unsafeOutlet?: boolean;\n  g: Genome;');
   sub('      const courseKeep = heads.slice();','      land.unsafeOutlet = false;\n      const courseKeep = heads.slice();');
   sub('      widenOutlets(h, W, H, courseKeep, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);',`      const open = h.slice();
      widenOutlets(open, W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);
      widenOutlets(h, W, H, courseKeep, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);
      for (let i = 0; i < N; i++) if (courseKeep[i] && open[i] < h[i]) { land.unsafeOutlet = true; break; }`);
   sub('      if (!lastAttempt && !g.tall && maxOf(hLand) > 16)', '      if (!lastAttempt && land.unsafeOutlet) return fail("outlet crosses a course", null, true);\n      if (!lastAttempt && !g.tall && maxOf(hLand) > 16)');
  }
 }
 if(mode.includes('routekeep')){
  levels=levels.replace('maxArea = Infinity): number {','maxArea = Infinity, routeKeep: Uint8Array | null = null): number {');
  const anchor='if (label[j] === id || h[j] > S || spill[j] > spill[c] || cost[j] <= k) continue;';
  if(!levels.includes(anchor))throw Error('route-keep anchor absent');
  levels=levels.replace(anchor,'if (label[j] === id || h[j] > S || spill[j] > spill[c] || cost[j] <= k || routeKeep?.[j]) continue;');
  sub('courseKeep, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);','courseKeep, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500, courseKeep);');
 }
 writeFileSync(resolve(dest,'land/levels.ts'),levels);
}else{try{rmSync(resolve(dest,'land/levels.ts'));}catch(e){if(e.code!=='ENOENT')throw e;}}
if(mode.includes('preflight')){
 sub('interface Land {\n  g: Genome;', 'interface Land {\n  outletRisk?: boolean;\n  g: Genome;');
 const a='    if (wider) widenOutlets(h, W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500);';
 sub(a, '    // Probe capacity on a copy; preserve the original course and repair only when needed.\n    land.outletRisk = wider && widenOutlets(h.slice(), W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500) > 0;');
 sub('      firstLook = Math.round(performance.now() - t0);', '      firstLook = land.outletRisk ? -1 : Math.round(performance.now() - t0);');
 sub('      opts.onLand?.({ attempt, heights: hLand, water: hy.water });', '      if (firstLook >= 0) opts.onLand?.({ attempt, heights: hLand, water: hy.water });');
 sub('  // D348: water over more of the map than the flood line', '  // Capacity-risk plans settle and receive any outlet repair before committing land.\n  if (firstLook < 0 && landStage && b1.settle.settled) {\n    firstLook = landStage.firstLook = Math.round(performance.now() - t0);\n    opts.onLand?.({ attempt, heights: hLand, water: hy.water });\n  }\n  // D348: water over more of the map than the flood line');
}
if(mode.includes('flowonly')){
 sub('land.outletRisk = wider && widenOutlets(h.slice(), W, H, heads, hash32(seed, "widen-small", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles), 1000, hy.water, 2500) > 0;', 'land.outletRisk = false;');
 sub('  const feedFix = (b: BuildResult): BuildResult | null => {', `  // A rising basin can drain at a gentler inflow while keeping its terrain.
  const drainFix = (b: BuildResult): BuildResult | null => {
    if (W < 256 || (shown.theme !== "riverValley" && shown.theme !== "lakeBasin")) return null;
    const sourceTiles = new Uint8Array(N);
    for (const e of b.waterModel.emitters) for (const i of e.cells) sourceTiles[i] = 1;
    const risen = risenBasin(h, W, H, b.water, sourceTiles);
    if (!risen) return null;
    const basin = new Uint8Array(N);
    for (const i of risen.tiles) basin[i] = 1;
    const spill = spillLevels(b.waterModel);
    const feeders = rivers.filter(f => {
      if (f.kind !== "river" && f.kind !== "lake") return false;
      if (f.kind === "river" && f.params.badwater) return false;
      const cells: number[] = [];
      for (const e of b.entities) if (e.owner === f.id && e.template === "WaterSource" && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) cells.push(e.y * W + e.x);
      return cells.length > 0 && reachesDown(cells, spill, W, H, basin);
    });
    if (!feeders.length) return null;
    const flowOf = (f: Feature) => f.kind === "river" ? f.params.flow : f.kind === "lake" && "spring" in f.params.inflow ? f.params.inflow.spring : 0;
    const setFlow = (f: Feature, v: number) => { if (f.kind === "river") f.params.flow = v; else if (f.kind === "lake") f.params.inflow = { spring: v }; };
    const flows = feeders.map(flowOf);
    for (const ratio of [0.7, 0.49, 0.343]) {
      feeders.forEach((f, i) => setFlow(f, Math.round(flows[i] * ratio * 1000) / 1000));
      const repaired = build([...rivers, ...bad.features], "resources");
      if (repaired.settle.settled && floodShare(repaired) <= floodLine) {
        fixes.push("rising basin fed gently");
        if (landStage) feeders.forEach(f => landStage!.fed[f.id] = flowOf(f));
        return repaired;
      }
    }
    feeders.forEach((f, i) => setFlow(f, flows[i]));
    return null;
  };
  const feedFix = (b: BuildResult): BuildResult | null => {`);
 sub('    const worn = wearFix(b1);', '    const worn = drainFix(b1) ?? wearFix(b1);');
}
if(mode.includes('riverplan'))sub('          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, false);', `          if (!keeps && N > 128 * 128 && shown.theme === "riverValley") {
            // Broaden the course on this field instead of shaping a fresh one.
            g.hydro.floor *= 1.25;
            return fail("promise (planned)", null, true);
          }
          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, false);`);
if(mode.includes('courseextra'))sub('replans >= REPLANS || land.settles', 'replans >= REPLANS + (W >= 256 && (specIn.theme === "riverValley" || specIn.theme === "lakeBasin") && (last as Attempt | null)?.result.info.stage === "a river\'s water leaves its course" ? 1 : 0) || land.settles');
if(mode.includes('smallwide'))sub('hy.flowTotal, hy.lakes.map((l) => l.tiles));', 'hy.flowTotal * (W <= 128 ? 2 : 1), hy.lakes.map((l) => l.tiles));');
if(mode.includes('freeze'))sub('  const wearFix = (b: BuildResult): BuildResult | null => {','  const wearFix = (b: BuildResult): BuildResult | null => {\n    // Round 2: a shown height is immutable, including outlet wear.\n    if (landStage && firstLook >= 0) return null;');
if(mode.includes('proof')){
 sub('  let base!: BuildResult;','  let base!: BuildResult;\n  let provedObjects: MapObjectFeature[] | null = null;');
 sub('    base = b;\n    if (!why) break;',`    if (!why) {
      const objects = planExtras({ spec, base: b, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh });
      const mb = build([...layout, ...objects.filter(f => f.params.kind === "mineSite")], "resources");
      const objs = mapObjects({ entities: mb.entities.map(entityJson) });
      const wet = Uint8Array.from(mb.water, d => d > WET ? 1 : 0);
      if (!mb.start || minesReached(objs, W, H, colonyReach(W, H, mb.heights, wet, objs, mb.start)) < minesWanted(W, H)) why = "mine pair (settled)";
      else provedObjects = objects;
    }
    base = b;
    if (!why) break;`);
 sub('  const objects = planExtras({ spec, base, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh });','  const objects = provedObjects ?? planExtras({ spec, base, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh });');
 sub('    markTried(tried, failed, W, H);\n    return settlerOn',`    markTried(tried, failed, W, H);
    const ready = landStage?.prepared.find(q => !tried[q.y * W + q.x] && !avoidOf(bad)[q.y * W + q.x] && !wetRing(b1, q) && !padFloods(h, W, H, b1.water, q.x, q.y, q.level));
    if (ready) return ready;
    return settlerOn`);
 if(mode.includes('smallproof'))gen=gen.replace('    if (!why) {\n      const objects = planExtras','    if (!why && N <= 96 * 96) {\n      const objects = planExtras');
}
if(mode.includes('smallready'))sub('const ready = landStage?.prepared.find', 'const ready = N <= 96 * 96 ? landStage?.prepared.find');
if(mode.includes('smallready'))sub('!padFloods(h, W, H, b1.water, q.x, q.y, q.level));\n    if (ready)', '!padFloods(h, W, H, b1.water, q.x, q.y, q.level)) : null;\n    if (ready)');
if(mode.includes('lakecourse'))sub('(specIn.theme === "riverValley" || specIn.theme === "lakeBasin") && (last as Attempt | null)?.result.info.stage', 'specIn.theme === "lakeBasin" && (last as Attempt | null)?.result.info.stage');
if(mode.includes('cleanflow')){
 sub('  outletRisk?: boolean;\n', '');
 sub('opts: GenerateOptions, wider: boolean): { h:', 'opts: GenerateOptions): { h:');
 sub('planLandStage(land, attempt, W, H, seed, ctx, protect, opts, W >= 256 && (shown.theme === "riverValley" || shown.theme === "lakeBasin"));', 'planLandStage(land, attempt, W, H, seed, ctx, protect, opts);');
 sub('    // Keep the existing large-basin cuts; add capacity only to smaller wet basins.\n    // Probe capacity on a copy; preserve the original course and repair only when needed.\n    land.outletRisk = false;', '');
 sub('      firstLook = land.outletRisk ? -1 : Math.round(performance.now() - t0);', '      firstLook = Math.round(performance.now() - t0);');
 sub('      if (firstLook >= 0) opts.onLand?.({ attempt, heights: hLand, water: hy.water });', '      opts.onLand?.({ attempt, heights: hLand, water: hy.water });');
 sub('if (landStage && firstLook >= 0) return null;', 'if (landStage) return null;');
 sub('  // Capacity-risk plans settle and receive any outlet repair before committing land.\n  if (firstLook < 0 && landStage && b1.settle.settled) {\n    firstLook = landStage.firstLook = Math.round(performance.now() - t0);\n    opts.onLand?.({ attempt, heights: hLand, water: hy.water });\n  }\n', '');
 try{rmSync(resolve(dest,'land/levels.ts'));}catch(e){if(e.code!=='ENOENT')throw e;}
}
writeFileSync(resolve(dest,'gen/generate.ts'),gen);
if(mode.includes('route')){
 let hy=readFileSync(resolve(root,'src/core/land/hydro.ts'),'utf8');
 const a='E[y * W + x] + wander * fbm(rs, x, y, wanderCell, 2)';
 if(!hy.includes(a))throw Error('route anchor missing');
 hy=hy.replace(a,'h[y * W + x] + 0.05 * wander * fbm(rs, x, y, wanderCell, 2)');
 writeFileSync(resolve(dest,'land/hydro.ts'),hy);
}else {const p=resolve(dest,'land/hydro.ts');try{rmSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}}
writeFileSync(resolve(dir,'local/round2-prototype.json'),JSON.stringify({mode},null,2));
if(mode.includes('portable')){
 mkdirSync(resolve(dest,'math'),{recursive:true});
 const portable=readFileSync(resolve(root,'investigation/determinism/portable.ts'),'utf8').replace("'../../src/core/math/detmath'","'./detmath'");
 writeFileSync(resolve(dest,'math/portable.ts'),portable);
 const delta=readFileSync(resolve(root,'src/core/land/delta.ts'),'utf8').replaceAll('Math.hypot(', 'hypot(');
 writeFileSync(resolve(dest,'land/delta.ts'),'import { hypot } from "../math/portable";\n'+delta);
}else for(const f of ['land/delta.ts','math/portable.ts']){try{rmSync(resolve(dest,f));}catch(e){if(e.code!=='ENOENT')throw e;}}
console.log('Round 2 prototype',mode);
