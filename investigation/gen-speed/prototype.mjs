// Read-only product sources; replacements are confined to this investigation.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {root,dir} from './build.mjs';
const read=f=>readFileSync(resolve(root,'src/core',f),'utf8').replaceAll('\r\n','\n');
function save(f,s){const p=resolve(dir,'candidate',f);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,s);}
function replace(s,a,b){if(!s.includes(a))throw Error('source drift: '+a.slice(0,100));return s.replace(a,b);}
let s=read('land/minePads.ts');
s=replace(s,'      if (cy > y1) y1 = cy;\n    }','      if (cy > y1) y1 = cy;\n      // The answer is monotone for one/two sites; more squares cannot undo it.\n      if (opts.want <= 1 || (opts.want === 2 && (x1 - x0 >= APART || y1 - y0 >= APART))) break;\n    }');
save('land/minePads.ts',s);
s=read('analysis/ridge.ts');
s=replace(s,'        sides.push(pts);\n      }','        sides.push(pts);\n        // No second side can make an insufficient first side into a wall.\n        if (pts.length < 6) break;\n      }');
s=replace(s,'if (sides[0].length < 6 || sides[1].length < 6)','if (sides[0].length < 6 || sides[1].length < 6)');
save('analysis/ridge.ts',s);
s=read('gen/settler.ts');
const start=s.indexOf('  const walk = shoreWalkFrom',s.indexOf('export function pickStart('));
const finish=s.indexOf('  const storedNear = ',start);
let prep=s.slice(start,finish);
prep=replace(prep,'  const sorted = Array.from(h).sort((a, b) => a - b);\n  const medianLevel = sorted[N >> 1];',`  // Heights are Uint8: count levels without changing the upper median.
  const counts = new Uint32Array(256);
  for (let i = 0; i < N; i++) counts[h[i]]++;
  let medianLevel = 0;
  let seen = 0;
  for (; medianLevel < 256; medianLevel++) {
    seen += counts[medianLevel];
    if (seen > (N >> 1)) break;
  }`);
const names='walk, walkAny, walkKept, dWet, boxSum, regions, dLake, dFall, dJoin, dSpring, medianLevel, margin, storeSum';
const helper=`/** Read-only fields for picks on identical terrain/water. Discard before either changes.
 * Avoid masks, scores, random draws and candidate walks remain private to each pick. */
export function prepareStart(h: Uint8Array, W: number, H: number,
  water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number> },
  hydro: Pick<Hydro, "water" | "lakes" | "falls" | "rivers">,
  waterRule: number, opts: SettlerOptions = {}) {
  const N = W * H;
  const D = water.depth;
${prep}  return { ${names} };
}

export type StartPreparation = ReturnType<typeof prepareStart>;

`;
s=s.slice(0,start)+`  const { ${names} } = opts.prepared ?? prepareStart(h, W, H, water, hydro, waterRule, opts);\n`+s.slice(finish);
s=replace(s,'export function pickStart(',helper+'export function pickStart(');
s=replace(s,'export interface SettlerOptions {','export interface SettlerOptions {\n  /** Only for repeated picks before terrain/water changes; no cross-attempt cache. */\n  prepared?: StartPreparation;');
save('gen/settler.ts',s);
s=read('gen/intentions.ts');
s=replace(s,'M: ArrayLike<number>): SettlerView &','M: ArrayLike<number>, kept9?: ArrayLike<number>): SettlerView &');
s=replace(s,'const kept = droughtStorage(waterModel(W, H, h, []), D, 9);','const kept = kept9 ?? droughtStorage(waterModel(W, H, h, []), D, 9);');
save('gen/intentions.ts',s);
s=read('gen/generate.ts');
s=replace(s,'import { dryStart, padFloods, pickStart,','import { dryStart, padFloods, pickStart, prepareStart,');
s=replace(s,'  let allowLevel = true;','  let allowLevel = true;\n  let plannedStart: { kept: Float64Array | null; storage: { kept: Float64Array; want: number }; view: ReturnType<typeof settlerView> | null; prepared: ReturnType<typeof prepareStart> } | null = null;');
s=replace(s,'near: { x: number; y: number } | null = null): StartPick | null => {','near: { x: number; y: number } | null = null, reusePlanned = false): StartPick | null => {');
s=replace(s,'    const model = waterModel(W, H, h, []);\n    const kept = policy === "off" ? null : droughtStorage(model, D, FIRST_DROUGHT_DAYS);\n    const storage = { kept: droughtStorage(model, D, DROUGHT[spec.designedFor].days), want: reservoirNeeded(spec.designedFor) * RESERVE[spec.settings.water.droughtReserve] };\n    const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M) : null;',`    let data = reusePlanned ? plannedStart : null;
    if (!data) {
      const model = waterModel(W, H, h, []);
      const kept = policy === "off" ? null : droughtStorage(model, D, FIRST_DROUGHT_DAYS);
      const storage = { kept: droughtStorage(model, D, DROUGHT[spec.designedFor].days), want: reservoirNeeded(spec.designedFor) * RESERVE[spec.settings.water.droughtReserve] };
      const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M, DROUGHT[spec.designedFor].days === 9 ? storage.kept : undefined) : null;
      const prepared = prepareStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, rule, { kept, drought: policy, storage });
      data = { kept, storage, view, prepared };
      if (reusePlanned) plannedStart = data;
    }
    const { kept, storage, view, prepared } = data;`);
s=replace(s,'{ avoid, kept, drought: policy, prefer, foot,','{ prepared, avoid, kept, drought: policy, prefer, foot,');
s=replace(s,'    guess = settlerOn(held, zero, moisture(h, held, zero, W, H, null), 0, avoidOf(null));',`    const heldMoist = moisture(h, held, zero, W, H, null);
    guess = settlerOn(held, zero, heldMoist, 0, avoidOf(null), 1, null, true);`);
s=replace(s,'second = settlerOn(held, zero, moisture(h, held, zero, W, H, null), 5, off);','second = settlerOn(held, zero, heldMoist, 5, off, 1, null, true);');
s=replace(s,'const more = settlerOn(held, zero, moisture(h, held, zero, W, H, null), 9 + k, off);','const more = settlerOn(held, zero, heldMoist, 9 + k, off, 1, null, true);');
s=replace(s,'      // (no wall along a map edge,','      // The shared fields expire before any levelling or mine-pad shaping.\n      plannedStart = null;\n      // (no wall along a map edge,');
save('gen/generate.ts',s);
console.log('Created five exact candidates; product files were read only.');
