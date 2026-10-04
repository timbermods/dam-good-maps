// Maps whose water a steady state cannot show (PLAN §11, D87; decisions-pending #36, the workshop
// study's W6). The canonical settle runs every running source to steady state on the top surface.
// Some maps rely on what that leaves out: water under roofs (caves and tunnels), sources that turn
// on later, aquifers that need a powered drill, seeps that stop at 0.8 deep, or a start that stands
// under a roof. On those maps the settle floods starts the game never floods (Hollows 9 deep,
// Nomads 7, Oasis 2.8), so their water and start checks are reported as approximate, with the
// reason, in both validators (prototype/playability.py `mechanics`).
//
// The causes are the study's (investigation/workshop/lib/measures.ts `mechanics`, lib/table.ts
// `waterReliable`): caves on 5% or more of tiles; delayed sources or aquifers carrying a quarter or
// more of the clean water; seeps carrying half or more of the running water; or the start below the
// top surface. A cause alone is not enough (PLAN §20, D98): the settle models seeps (they stop at
// 0.8 deep), and on Spillage, Pillars and HelixMountain it keeps their starts dry and matches their
// own water within 7% of the map. So the checks turn approximate only where the settle also
// disagrees with the map's own water: it floods more of the start's ring (Chebyshev 2) than the
// map's water does, or its wet tiles differ from the map's on 10% or more of the map (official maps
// without a cause differ by at most 9%). A start under a roof is approximate on its own.

import { startMiddleTile } from "../format/footprints";
import { isDelayed, specifiedStrength, type MapObject } from "../sim/model";

export const CAVE_SHARE = 0.05;
export const DELAYED_SHARE = 0.25;
export const SEEP_SHARE = 0.5;

export interface Mechanics {
  /** Clean water by kind, blocks per second (SpecifiedStrength, summed in object order). */
  cleanRunning: number;
  cleanDelayed: number;
  aquifers: number;
  seeps: number;
  /** Share of tiles with more than one floor (caves, tunnels, overhangs). */
  caveShare: number;
  /** The start stands below the top surface of its tile. */
  startUnderRoof: boolean;
  /** Why the steady state cannot show this map's water, in plain words (empty when it can). */
  reasons: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function mechanicsOf(objects: readonly MapObject[], floors: Uint8Array, surface: Uint8Array, W: number, H: number): Mechanics {
  let cleanRunning = 0;
  let cleanDelayed = 0;
  let aquifers = 0;
  let seeps = 0;
  const starts: MapObject[] = [];
  for (const o of objects) {
    if (o.template === "StartingLocation") starts.push(o);
    const s = o.template === "WaterSource" || o.template === "WaterSeep" || o.template === "Aquifer" ? specifiedStrength(o.components) : 0;
    if (o.template === "WaterSource") {
      if (isDelayed(o.components)) cleanDelayed += s;
      else cleanRunning += s;
    } else if (o.template === "WaterSeep") seeps += s;
    else if (o.template === "Aquifer") aquifers += s;
  }
  let caves = 0;
  for (let i = 0; i < floors.length; i++) if (floors[i] > 1) caves++;
  const caveShare = floors.length ? caves / floors.length : 0;
  let startUnderRoof = false;
  if (starts.length === 1) {
    const [x, y] = startMiddleTile(starts[0]);
    if (x >= 0 && y >= 0 && x < W && y < H && surface[y * W + x] !== starts[0].z) startUnderRoof = true;
  }
  const clean = cleanRunning + cleanDelayed + aquifers + seeps;
  const reasons: string[] = [];
  if (caveShare >= CAVE_SHARE) reasons.push(`caves or overhangs cover ${pct(caveShare)} of the map`);
  if (clean > 0 && cleanDelayed >= DELAYED_SHARE * clean) reasons.push(`sources that turn on later carry ${pct(cleanDelayed / clean)} of the clean water`);
  if (clean > 0 && aquifers >= DELAYED_SHARE * clean) reasons.push(`aquifers carry ${pct(aquifers / clean)} of the clean water`);
  if (clean > 0 && seeps >= SEEP_SHARE * (cleanRunning + seeps)) reasons.push(`seeps carry ${pct(seeps / (cleanRunning + seeps))} of the running water`);
  if (startUnderRoof) reasons.push("the start is under a roof");
  return { cleanRunning, cleanDelayed, aquifers, seeps, caveShare, startUnderRoof, reasons };
}

/** Wet share difference between the settle and the map's own water that shows the settle cannot
 *  stand for it (official maps without a cause: at most 0.09). */
export const DISAGREE_SHARE = 0.1;

/** Why the settled water cannot stand for the map's own water, or null when it can: the causes,
 *  with the evidence that the settle disagrees with the map's own water (`stored`: its wet tiles,
 *  depth over 0.05 at any level; `ring`: the start's tiles within Chebyshev 2). */
export function approximateReason(m: Mechanics, settled: ArrayLike<number>, stored: Uint8Array | null, ring: readonly number[] | null): string | null {
  if (m.startUnderRoof) return m.reasons.join("; ");
  if (!m.reasons.length || !stored) return null;
  let differ = 0;
  for (let i = 0; i < stored.length; i++) if ((settled[i] > 0.05 ? 1 : 0) !== stored[i]) differ++;
  let ringSettled = 0;
  let ringStored = 0;
  for (const i of ring ?? []) {
    if (settled[i] > 0.05) ringSettled++;
    if (stored[i]) ringStored++;
  }
  const evidence: string[] = [];
  if (ringSettled > ringStored) evidence.push("settled water floods the start, which the map's own water keeps dry");
  if (differ >= DISAGREE_SHARE * stored.length) evidence.push(`the settled water differs from the map's own water on ${pct(differ / stored.length)} of the map`);
  return evidence.length ? [...m.reasons, ...evidence].join("; ") : null;
}

/** Tiles where a map's own water (WaterMapNew, any level) is deeper than 0.05. */
export function storedWetMask(stored: { tile: ArrayLike<number>; depth: ArrayLike<number> }, N: number): Uint8Array {
  const out = new Uint8Array(N);
  for (let k = 0; k < stored.tile.length; k++) if (stored.depth[k] > 0.05) out[stored.tile[k]] = 1;
  return out;
}

/** The start's ring: tiles within Chebyshev 2 of the middle of its 3×3 (start.dry's tiles). */
export function startRing(objects: readonly MapObject[], W: number, H: number): number[] | null {
  const starts = objects.filter((o) => o.template === "StartingLocation");
  if (starts.length !== 1) return null;
  const [cx, cy] = startMiddleTile(starts[0]);
  const out: number[] = [];
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (x >= 0 && y >= 0 && x < W && y < H) out.push(y * W + x);
  return out;
}

/** Check ids a map's mechanics make approximate: its water checks and its start checks (the
 *  playability class; the load checks of the start stay exact). The starting-logs floor,
 *  `start.wood_floor`, stays exact too: its logs are counted over the ground and its slopes, never
 *  the water, and it is absolute (D224, D225, D227). */
export function approximateId(id: string): boolean {
  return id.startsWith("water.") || /^start\.(dry|water|badwater|reach|food|wood|ruins_clear)$/.test(id);
}
