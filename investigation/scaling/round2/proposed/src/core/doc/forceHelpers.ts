// Pure worker helpers extracted from pinned source; share these at adoption.
import type {MapSession} from "./session";
import {geology} from "../forces/random";
import {trimRock} from "../forces/rock";
import {plainEntities,type FullForceMap} from "../forces/force";
import type {ForceResultParams} from "../forces/op";
import type {TerrainState} from "../features/raster/strokePreview";
import {integrityAt} from "../features/raster/terrain";
import type {Finalize} from "../forces/runs";
const geologies=new WeakMap<MapSession,number[]>(),rocks=new WeakMap<object,Uint32Array|null>();
const poses=new WeakMap<object,Map<string,{dx:number;dy:number}>>();
const lifeOf=(c:any)=>({dead:c?.LivingNaturalResource?.IsDead===true});
export function geologyOf(s: MapSession): number[] {
  let g = geologies.get(s);
  if (!g) geologies.set(s, (g = geology(s.openedHeights)));
  return g;
}

export function rockOf(s: MapSession): Uint32Array | null {
  const b = s.built;
  if (rocks.has(b)) return rocks.get(b)!;
  let lava: Uint32Array | null = null;
  for (const op of s.state.sculpts)
    if (op.op === "forceResult" && op.params.rock) {
      lava ??= new Uint32Array(b.W * b.H);
      const { tiles, bits } = op.params.rock;
      for (let k = 0; k < tiles.length; k++) lava[tiles[k]] = bits[k];
    }
  if (lava) trimRock({ heights: b.heights, lava });
  rocks.set(b, lava);
  return lava;
}

export function fallenOf(s: MapSession): Map<string, { dx: number; dy: number }> {
  const b = s.built;
  let out = poses.get(b);
  if (out) return out;
  out = new Map();
  for (const op of s.state.sculpts) if (op.op === "forceResult") for (const f of op.params.felled ?? []) out.set(f.id, { dx: f.dx, dy: f.dy });
  if (out.size) {
    const dead = new Set(b.entities.filter((e) => lifeOf(e.raw ? (e.raw.Components as Record<string, unknown>) : { ...(e.before ?? {}), ...e.components }).dead).map((e) => e.id));
    for (const id of [...out.keys()]) if (!dead.has(id)) out.delete(id);
  }
  poses.set(b, out);
  return out;
}

export function stagedForceMap(m: FullForceMap): FullForceMap {
  return { ...m, entities: plainEntities(m.entities.map((e) => (e.raw ? (({ raw: _raw, ...rest }) => rest)(e) : e))) };
}

export function buildTouches(state: TerrainState, ground: Uint8Array, owned?: () => Uint8Array | null): Finalize {
  return (m) => {
    const { W, H } = m;
    const pre = state.pre.slice();
    const protect = state.protect.slice();
    const own = owned?.() ?? null;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < m.heights.length; i++)
      if (m.heights[i] !== ground[i] || own?.[i]) {
        pre[i] = m.heights[i];
        protect[i] = 1;
        const x = i % W;
        const y = (i - x) / W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (x1 < 0) return;
    const base = state.base;
    const locked = state.locked;
    const candidate = base ? (i: number) => pre[i] !== base[i] : locked ? (i: number) => !locked[i] : () => true;
    integrityAt(pre, m.heights, W, H, protect, state.channel, candidate, Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(W - 1, x1 + 1), Math.min(H - 1, y1 + 1));
    trimRock(m);
  };
}

export function withOwned(p: ForceResultParams, heights: Uint8Array, owned: Uint8Array | null): ForceResultParams {
  if (!owned) return p;
  const at = new Map(p.tiles.map((i, k) => [i, p.heights[k]]));
  for (let i = 0; i < owned.length; i++) if (owned[i] && !at.has(i)) at.set(i, heights[i]);
  const tiles = [...at.keys()].sort((a, b) => a - b);
  return { ...p, tiles, heights: tiles.map((i) => at.get(i)!) };
}

export function glacierSprings(before: FullForceMap, after: FullForceMap, lake: { tiles: readonly number[]; floor: readonly number[]; depth: readonly number[]; contamination: readonly number[] }): Pick<ForceResultParams, "sources" | "lake"> {
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
