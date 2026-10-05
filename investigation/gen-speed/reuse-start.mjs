import {readFileSync,writeFileSync} from 'node:fs';
const file='investigation/gen-speed/overlay/src/core/gen/generate.ts';
let s=readFileSync(file,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('missing '+a.slice(0,100));s=s.replace(a,b);}
replace('  // (D411, D417: a sea\'s start goes on an island',`  // One bounded preparation for settled-water retries. Snapshot every array read by
  // prepareStart/settlerView; inputs and the snapshots must match by value before reuse.
  // The avoid mask, salt, preference weight, near target and RNG stay per pick.
  let settledStart: { h: Uint8Array; water: Uint8Array; D: Float64Array; C: Float64Array; M: Float64Array; hydro: string; data: StartData } | null = null;
  // (D411, D417: a sea's start goes on an island`);
replace('    let data = reusePlanned ? plannedStart : null;\n    if (!data) {\n      const model = waterModel(W, H, h, []);',`    let data = reusePlanned ? plannedStart : null;
    const hydroKey = data ? "" : JSON.stringify([hy.lakes, hy.falls, hy.rivers, g.intentions]);
    if (!data && !reusePlanned && settledStart && settledStart.hydro === hydroKey && sameNumbers(h, settledStart.h) && sameNumbers(hy.water, settledStart.water) && sameNumbers(D, settledStart.D) && sameNumbers(C, settledStart.C) && sameNumbers(M, settledStart.M)) data = settledStart.data;
    if (!data) {
      const snapshot = reusePlanned ? null : { h: h.slice(), water: hy.water.slice(), D: Float64Array.from(D), C: Float64Array.from(C), M: Float64Array.from(M) };
      const ground = snapshot?.h ?? h;
      const depth = snapshot?.D ?? D;
      const contamination = snapshot?.C ?? C;
      const moist = snapshot?.M ?? M;
      const model = waterModel(W, H, ground, []);`);
replace('      const drought = prepareDrought(model, D);', '      const drought = prepareDrought(model, depth);');
replace('      const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M) : null;', '      const view = g.intentions.length ? settlerView(ground, W, H, hy, depth, contamination, moist) : null;');
replace('      const prepared = prepareStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, rule, { kept, drought: policy, storage });', '      const prepared = prepareStart(ground, W, H, { depth, contamination, moisture: moist }, hy, rule, { kept, drought: policy, storage });');
replace('      data = { kept, storage, view, prepared };\n      if (reusePlanned) plannedStart = data;\n    }\n    const { kept, storage, view, prepared } = data;',`      data = { kept, storage, view, prepared };
      if (snapshot) settledStart = { ...snapshot, hydro: hydroKey, data };
    }
    if (reusePlanned) plannedStart = data;
    const { kept, storage, view, prepared } = data;`);
replace('function maxOf(h: Uint8Array): number {',`/** Conservative value equality for bounded generation snapshots: NaNs force recomputation. */
function sameNumbers(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] || Object.is(a[i], -0) !== Object.is(b[i], -0)) return false;
  return true;
}

function maxOf(h: Uint8Array): number {`);
replace("  let plannedStart: { kept: Float64Array | null; storage: { kept: Float64Array; want: number }; view: ReturnType<typeof settlerView> | null; prepared: ReturnType<typeof prepareStart> } | null = null;","  type StartData = { kept: Float64Array | null; storage: { kept: Float64Array; want: number }; view: ReturnType<typeof settlerView> | null; prepared: ReturnType<typeof prepareStart> };\n  let plannedStart: StartData | null = null;");
writeFileSync(file,s);
