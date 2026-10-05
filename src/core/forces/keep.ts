// A force as the editor keeps it (PLAN §20 D194, D220, D254; D342: assembled in the core, the
// worker only drives the run and applies the operation): what the player asked of it, as its
// operation keeps it (`forceRecordOf`), and the operation itself (`keptForceParams`): a carve's or a
// staged force's result, a glacier's springs and tarn and the ground it owns, eased to the working
// area's edge, its object changes only for the objects still standing.

import { areaDepth } from "../features/raster/brush";
import { carveForceParams } from "./carve/result";
import type { DepositRun } from "./deposit";
import type { RiftRun } from "./rift";
import type { CarveRun } from "./carve/run";
import type { CraterRun, EruptRun, QuakeRun, StagedRun } from "./runs";
import type { ForceMap } from "./force";
import { GlaciateRun } from "./glaciate/run";
import type { ForceResultParams, ForceSettingsRecord, ForceWhere } from "./op";
import { pathRecord, stagedParamsOf } from "./result";
import type { ForceRequest } from "./start";

/** What a staged force (Craterize, Erupt, Quake, Glaciate) asked for, as its operation keeps it: the
 *  settings it ran with and where (its run's own, `run`, for the request `req`, on a map `W` wide).
 *  A carve keeps its own record (`carveForceParams`). */
export function forceRecordOf(req: ForceRequest, run: StagedRun, W: number): { settings: ForceSettingsRecord; where: ForceWhere } {
  switch (req.verb) {
    case "craterize": {
      const r = run as CraterRun;
      return { settings: { ...r.settings }, where: { origin: req.origin, ...(r.settings.mode === "aim" && req.end ? { end: req.end } : {}) } };
    }
    case "erupt": {
      const r = run as EruptRun;
      return { settings: { ...r.settings }, where: { origin: req.origin, ...(r.settings.mode === "fissure" && req.path ? { path: pathRecord(req.path) } : {}) } };
    }
    case "deposit": {
      const r = run as DepositRun;
      return { settings: { ...r.settings }, where: { path: pathRecord(r.intent.path) } };
    }
    case "rift": {
      const r = run as RiftRun;
      return { settings: { ...r.settings }, where: { path: pathRecord(r.intent.path) } };
    }
    case "quake": {
      const r = run as QuakeRun;
      return { settings: { ...r.settings }, where: { path: pathRecord(r.intent.path), side: r.intent.side } };
    }
    case "glaciate": {
      const r = run as GlaciateRun;
      const via = r.intent.via ?? [];
      // (its drawn path, D321 item 41: the whole line it was given, origin to end)
      return { settings: { ...r.settings }, where: { origin: req.origin, ...(r.settings.mode === "aim" && req.end ? { end: req.end } : {}), ...(via.length ? { path: pathRecord([req.origin, ...via.map((i) => [i % W, Math.floor(i / W)] as [number, number]), req.end!].map(([x, y]) => ({ x, y }))) } : {}) } };
    }
    default:
      throw new Error("a carve keeps its own record");
  }
}

/** What `keptForceParams` is given: the map the force started from, its request, its run (a carve's
 *  or a staged force's, as far as it has gone: a staged one planned), the force it replaces (Try
 *  another), and the objects standing on the map now (`standing`: the objects the map placed again
 *  while the force worked may be gone by now; left out, all of them stand). */
export interface KeptForceInput {
  before: ForceMap;
  request: ForceRequest;
  carve: CarveRun | null;
  staged: StagedRun | null;
  replaces?: number;
  standing?: ReadonlySet<string>;
}

/** The operation a kept force becomes (`forceResult`, op.ts), or why there is none (one plain
 *  reason: it changed nothing). */
export function keptForceParams(input: KeptForceInput): { ok: true; params: ForceResultParams } | { ok: false; error: string } {
  const { before, request } = input;
  const refused = (error: string) => ({ ok: false as const, error });
  let params: ForceResultParams | null;
  if (input.carve) {
    const r = input.carve;
    const req = request as Extract<ForceRequest, { verb: "carve" }>;
    const aimed = req.settings.mode === "aim" && req.end ? req.end : undefined;
    // (an unleashed source's carve starts where it broke out, with its width and dry: the run's own)
    const origin: [number, number] = req.source ? [r.intent.origin % before.W, Math.floor(r.intent.origin / before.W)] : req.origin;
    params = carveForceParams(before, r, { settings: req.source ? r.settings : req.settings, origin, ...(aimed ? { end: aimed } : {}), cut: req.cut, ...(input.replaces !== undefined ? { replaces: input.replaces } : {}) });
    if (params && req.source) params = { ...params, where: { ...params.where, source: req.source } };
    // (its drawn path, D321 item 41: the curve's points from the origin to the end, kept with its record)
    if (params && aimed && req.via?.length) params = { ...params, where: { ...params.where, path: [origin, ...req.via, aimed].map(([x, y]) => [x, y] as [number, number]) } };
    if (!params) return refused(req.source ? "Its water found nothing to carve from there: more Power, or drag from Unleash to aim it" : "Nothing was carved");
  } else {
    const r = input.staged!;
    const after = r.final();
    if (!after) return refused("Nothing changed");
    // (its steps are the stages that show it, whatever the machine's speed: D366)
    params = stagedParamsOf(before, r, { verb: request.verb, ...forceRecordOf(request, r, before.W), cut: request.cut, ...(input.replaces !== undefined ? { replaces: input.replaces } : {}) });
    if (!params) return refused("Nothing changed");
    // a glacier's springs (its cirque head's, its hanging valleys') and its tarn's water (D246), and
    // its whole ground, the levels it left as they were included (the build keeps its banks whole)
    if (r instanceof GlaciateRun && r.plan) params = { ...withOwned(params, after.heights, r.footprint()), ...glacierSprings(before, after, r.plan.retained) };
  }
  // the working area's feathered edge (D254): inside it, the land eases to the locked land a level a
  // tile, never in a cliff along its edge
  if (request.area && request.verb !== "rift" && request.verb !== "deposit") { // Rift and Deposit feather their terrain in Rust, before playback.
    params = featherForce(params, before.heights, areaDepth(request.area, before.W, before.H));
    if (!params) return refused("Nothing changed inside the working area");
  }
  // objects the map placed again while the force worked (its settled water re-planted the trees) may
  // be gone by now: the force's object changes are for the ones still there
  const here = input.standing;
  if (here && params.replaces === undefined) {
    params = { ...params, removed: params.removed.filter((id) => here.has(id)) };
    if (params.moved) params.moved = params.moved.filter((m) => here.has(m.id));
    if (params.felled) params.felled = params.felled.filter((m) => here.has(m.id));
  }
  return { ok: true, params };
}

/** A force's result with the ground it owns listed too, at its level (unchanged ones included). */
export function withOwned(p: ForceResultParams, heights: Uint8Array, owned: Uint8Array | null): ForceResultParams {
  if (!owned) return p;
  const at = new Map(p.tiles.map((i, k) => [i, p.heights[k]]));
  for (let i = 0; i < owned.length; i++) if (owned[i] && !at.has(i)) at.set(i, heights[i]);
  const tiles = [...at.keys()].sort((a, b) => a - b);
  return { ...p, tiles, heights: tiles.map((i) => at.get(i)!) };
}

/** The springs a glacier added and the tarn it keeps, as its operation keeps them. */
export function glacierSprings(before: ForceMap, after: ForceMap, lake: { tiles: readonly number[]; floor: readonly number[]; depth: readonly number[]; contamination: readonly number[] }): Pick<ForceResultParams, "sources" | "lake"> {
  const had = new Set(before.entities.map((e) => e.id));
  const sources = after.entities
    .filter((e) => !had.has(e.id) && e.template === "WaterSource")
    .map((e) => {
      const ws = ({ ...(e.before ?? {}), ...e.components } as { WaterSource?: { SpecifiedStrength?: unknown } }).WaterSource;
      const raw = ws?.SpecifiedStrength;
      const strength = typeof raw === "number" ? raw : Number((raw as { value?: number } | undefined)?.value ?? 0);
      return { id: e.id, x: e.x, y: e.y, strength };
    })
    .filter((q) => q.strength > 0);
  return { ...(sources.length ? { sources } : {}), ...(lake.tiles.length ? { lake: { tiles: [...lake.tiles], floor: [...lake.floor], depth: [...lake.depth], contamination: [...lake.contamination] } } : {}) };
}

/** A force's result eased to the working area's edge (D254): a tile changes at most as many levels as
 *  it is steps inside the area (`inside`, 0 outside it), so the edit meets the locked land a level a
 *  tile; tiles it leaves as they were drop out, and fresh rock keeps only the levels still standing.
 *  Null when nothing is left changed. */
export function featherForce(p: ForceResultParams, before: Uint8Array, inside: Uint8Array): ForceResultParams | null {
  const tiles: number[] = [];
  const heights: number[] = [];
  const now = new Map<number, number>();
  p.tiles.forEach((i, k) => {
    const room = inside[i];
    const h0 = before[i];
    const h = Math.max(h0 - room, Math.min(h0 + room, p.heights[k]));
    now.set(i, h);
    if (h === h0) return;
    tiles.push(i);
    heights.push(h);
  });
  if (!tiles.length) return null;
  const rock = p.rock
    ? { tiles: p.rock.tiles.slice(), bits: p.rock.bits.map((b, k) => {
        const h = now.get(p.rock!.tiles[k]);
        return h === undefined || h >= 31 ? b : b & ((1 << h) - 1);
      }) }
    : undefined;
  return { ...p, tiles, heights, ...(rock ? { rock } : {}) };
}
