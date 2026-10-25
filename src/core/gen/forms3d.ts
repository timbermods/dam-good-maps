// 3D forms as intentions on a generated map (D138, D488; land/forms3d.ts grows them): a spring cave
// feeding the river, an overhang sheltering the start, an arch over a gorge. A map draws which it looks
// for from its own stream, more and bolder as Verticality rises (D132); the land decides whether each
// finds a place, and a check on the finished map confirms it, as for M9b's other intentions. One the
// map cannot keep while every check holds is dropped, never forced.

import type { BuildResult } from "../features/build";
import { entityTiles } from "../features/edits";
import { featureId } from "../features/ids";
import type { Feature, RiverFeature } from "../features/schema";
import { growForms, type FormPlan, type Forms, type FormsWanted } from "../land/forms3d";
import type { Rng } from "../math/rng";
import { seenFloor, seenThroughRoofs } from "../sim/stackWater";
import type { ThemeId } from "../spec/mapspec";
import { PLANT_CLEARANCE } from "../terrain/clearance";
import { isPlainMask, TERRAIN_LAYERS } from "../terrain/runs";

/** How far from a source already on the map a new spring's water may join a river (tiles). */
const SOURCE_REACH = 10;

/** Which forms a map looks for, and how many of each (D132's bands: none at 0; at the ordinary
 *  Verticality a small one or two, a cave or a shelter; arches from 35; up to six of three kinds at 80
 *  and above). Its own stream: the rest of the map draws nothing different. */
export function formsWanted(theme: ThemeId, vt: number, rng: Rng): FormsWanted {
  const out: FormsWanted = {};
  const u = [rng.float(), rng.float(), rng.float(), rng.float()];
  if (vt <= 0) return out;
  // (gorges are the Canyon's and the Highlands' land; Lake Basin and Delta lean low)
  const arch = theme === "canyon" || theme === "highlands" ? 1.25 : theme === "lakeBasin" || theme === "delta" ? 0.6 : 1;
  const springs = u[0] < Math.min(0.9, 0.25 + vt / 100) ? 1 + (vt >= 50 ? 1 : 0) + (vt >= 75 ? 1 : 0) : 0;
  if (springs) out["spring-cave"] = springs;
  if (u[1] < Math.min(0.85, 0.2 + vt / 100)) out["start-overhang"] = 1;
  if (vt >= 35 && u[2] < Math.min(0.9, ((vt - 25) / 60) * arch)) out["gorge-arch"] = 1 + (vt >= 70 && u[3] < 0.6 ? 1 : 0);
  return out;
}

/** The forms grown on a finished map's land, water, objects and start (nothing changed yet). */
export function growOn(built: BuildResult, features: readonly Feature[], want: FormsWanted, vt: number, top: number, rng: Rng): Forms {
  const { W, H } = built;
  const N = W * H;
  const keep = new Uint8Array(N);
  const plants = new Uint8Array(N);
  for (const e of built.entities) {
    const plant = e.template in PLANT_CLEARANCE || e.template.startsWith("RuinColumn");
    for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) (plant ? plants : keep)[y * W + x] = 1;
  }
  // the start's ground and a tile round it
  const st = built.start ?? null;
  if (st)
    for (let y = st.y - 4; y <= st.y + 4; y++)
      for (let x = st.x - 4; x <= st.x + 4; x++) if (x >= 0 && y >= 0 && x < W && y < H && Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) <= 2) keep[y * W + x] = 1;
  // (a new spring's water joins a river well away from every source already there, D171)
  const nearSource = new Uint8Array(N);
  for (const e of built.entities) {
    if (e.template !== "WaterSource" && e.template !== "BadwaterSource") continue;
    for (let y = Math.max(0, e.y - SOURCE_REACH); y <= Math.min(H - 1, e.y + SOURCE_REACH); y++)
      for (let x = Math.max(0, e.x - SOURCE_REACH); x <= Math.min(W - 1, e.x + SOURCE_REACH); x++) nearSource[y * W + x] = 1;
  }
  const rivers = features.filter((f): f is RiverFeature => f.kind === "river").map((f) => ({ id: f.id, path: f.params.path, badwater: f.params.badwater }));
  return growForms({ W, H, heights: built.heights, water: built.water, contamination: built.contamination, keep, plants, start: st ? { x: st.x, y: st.y, z: st.z } : null, nearSource, rivers, top, vt }, want, rng);
}

/** The stream of a spring cave as a river of its own (D171: a tributary rises at its own spring),
 *  from its source in the cave's pool to the river it feeds. Its ground is the field's. */
export function caveStream(seed: number, form: FormPlan, k: number, W: number): RiverFeature {
  const role = `river/caveSpring/${k}`;
  const pts = form.course!.map((i): [number, number] => [i % W, Math.floor(i / W)]);
  // (a point at each turn of the course: straight runs between)
  const path: [number, number][] = [pts[0]];
  for (let q = 1; q + 1 < pts.length; q++) {
    const [ax, ay] = path[path.length - 1];
    const [bx, by] = pts[q];
    const [cx, cy] = pts[q + 1];
    if ((bx - ax) * (cy - by) !== (by - ay) * (cx - bx)) path.push(pts[q]);
  }
  path.push(pts[pts.length - 1]);
  return {
    id: featureId(seed, "river", role),
    kind: "river",
    origin: "generated",
    role,
    locked: false,
    params: { path, width: 2, bedDepth: 1, bedProfile: { start: 0, steps: [] }, flow: form.flow!, style: "straight", entry: { spring: pts[0] }, exit: { river: form.river! }, badwater: false },
  };
}

export interface FormCheck {
  ok: boolean;
  note: string;
  say?: string;
}

/** Whether a form stands on the finished map as it was grown (D138: the outcome, checked): a cave's
 *  spring under its roof whose water runs out to the river, level ground under the rock beside the
 *  start, a deck over the gorge with the river under it. */
export function checkForm(form: FormPlan, built: BuildResult, owner: string | null): FormCheck {
  const { W, H } = built;
  const N = W * H;
  const mask = built.waterModel.stacked?.mask;
  const stack = built.settle.stack;
  if (!mask || !stack) return { ok: false, note: "no terrain above terrain in the build" };
  const seen = seenThroughRoofs(stack).depth;
  const solid = (i: number, z: number) => z >= 0 && z < TERRAIN_LAYERS && !!(mask[i] & (1 << z));
  const roofOver = (i: number, z: number) => {
    for (let k = z; k < TERRAIN_LAYERS; k++) if (solid(i, k)) return k;
    return -1;
  };
  switch (form.id) {
    case "spring-cave": {
      const sources = built.entities.filter((e) => e.owner === owner && e.template === "WaterSource");
      if (!sources.length) return { ok: false, note: "its spring has no source" };
      const under = sources.filter((e) => roofOver(e.y * W + e.x, e.z) >= 0).length;
      const course = form.course ?? [];
      const dry = course.filter((i) => !(seen[i] > 0.01)).length;
      const ok = under === sources.length && dry === 0 && seen[course[course.length - 1]] >= 0.05;
      const len = course.filter((i) => !isPlainMask(mask[i])).length;
      return { ok, note: `${under} of ${sources.length} sources under a roof, ${dry} of ${course.length} tiles of its course dry`, ...(ok ? { say: `A spring rises in a cave ${len} tiles into the cliff and feeds the river.` } : {}) };
    }
    case "start-overhang": {
      const st = built.start;
      if (!st) return { ok: false, note: "no start" };
      const z = st.z;
      // level ground at the start's floor joined to it, and how much of it is under rock
      const floor = (i: number) => solid(i, z - 1) && !solid(i, z) && !solid(i, z + 1) && !(seen[i] > 0.01);
      const seenTile = new Uint8Array(N);
      const q: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const i = (st.y + dy) * W + st.x + dx;
          seenTile[i] = 1;
          q.push(i);
        }
      let roofed = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        if (Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) > 12) continue;
        if (roofOver(i, z) >= 0) roofed++;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ddx;
          const yy = y + ddy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (seenTile[j] || !floor(j)) continue;
          seenTile[j] = 1;
          q.push(j);
        }
      }
      const ok = roofed >= 4;
      return { ok, note: `${roofed} tiles of the start's level ground under rock`, ...(ok ? { say: `An overhang shelters the start: ${roofed} tiles of level ground lie under the rock beside it.` } : {}) };
    }
    case "gorge-arch": {
      const deck = form.tiles;
      const floors = seenFloor(stack, built.heights);
      let over = 0;
      let air = 99;
      for (const i of deck) {
        if (!(seen[i] > 0.1)) continue;
        over++;
        // the air between the water and the arch's underside over it
        const surface = Math.ceil(floors[i] + seen[i]);
        const low = roofOver(i, surface);
        if (low >= surface) air = Math.min(air, low - surface);
      }
      const ok = over >= 1 && air >= 2 && air < 99;
      return { ok, note: `${over} of ${deck.length} deck tiles over water, ${air === 99 ? 0 : air} levels of air under it`, ...(ok ? { say: `A natural arch spans the gorge, the river running ${air} levels under it.` } : {}) };
    }
  }
}
