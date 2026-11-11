// The `land` invariants of stage 1 (docs/PREMISES.md §2.2, §7 step 2): `flowThrough` on the rastered water alone —
// stage 1's heights with nothing else drawn — gives each body's level within half a level of its sill, lets no water
// out but by a planned exit, wets what the table wets and nothing else, drops each fall its height over a lip as wide
// as it was built, and every row of Blockages spans its channel. Arithmetic on the heights, no settle: the settle's
// contract is tests/contract/premiseWater.test.ts's.

import { flowThrough } from "../sim/prefill";
import { weirWidth } from "./levels";
import { near4, type WaterRaster } from "./raster/field";
import type { Invariant, InvariantResult, PremisePlan, StageContext } from "./types";
import { rowSpans, stageModel, type StageWater } from "./water";

/** How far a body's spill level may stand from its sill. */
export const LEVEL_SLACK = 0.5;
/** How far along a link (past its first row) its water shows whether it comes down it. */
const HEAD = 3;

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The flow the checks read, once per stage 1: `flowThrough` with the rows shut and every notch and breach shut too.
 *  Its spill levels are static, so an open notch would stand its lake at the notch's level, a level under the sill
 *  the table's water stands over (the table carries the notch's share: levels.ts); shut, the levels are the sills'.
 *  Where the water goes is the same either way: a notch pours into its own fall's pool. */
const cache = new WeakMap<StageWater, ReturnType<typeof flowThrough>>();
export function stageFlow(w: StageWater): ReturnType<typeof flowThrough> {
  let f = cache.get(w);
  if (!f) {
    f = flowThrough(stageModel(w, { shutNotches: true }));
    cache.set(w, f);
  }
  return f;
}

function need(ctx: StageContext): StageWater {
  if (!ctx.water) throw new Error("A land invariant needs stage 1's water");
  return ctx.water;
}

/** Each body's spill level, low and high over its tiles (the notches and breaches shut: the sill the plan sets), and
 *  where it should be: its sill, or a level over it for a body with no way out (a pond a work fills: its rim). */
export function levelsOf(plan: PremisePlan, w: StageWater): { id: string; sill: number; want: number; low: number; high: number; tiles: number }[] {
  const r = w.raster;
  const { spill } = stageFlow(w);
  return plan.bodies.map((b, k) => {
    let low = Infinity;
    let high = -Infinity;
    let tiles = 0;
    for (let i = 0; i < r.W * r.H; i++) {
      if (r.lake[i] !== k + 1) continue;
      tiles++;
      if (spill[i] < low) low = spill[i];
      if (spill[i] > high) high = spill[i];
    }
    const want = plan.links.some((l) => l.from === b.id) ? b.sill : b.sill + 1;
    return { id: b.id, sill: b.sill, want, low, high, tiles };
  });
}

const waterLevels: Invariant = {
  id: "water.levels",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    for (const b of levelsOf(ctx.plan, w)) {
      if (!b.tiles) return fail(`${b.id} has no water tiles`);
      if (b.high - b.want > LEVEL_SLACK || b.want - b.low > LEVEL_SLACK)
        return fail(`${b.id} stands at ${b.low}–${b.high}, its sill ${b.sill}${b.want !== b.sill ? `, its rim ${b.want}` : ""}`);
    }
    return OK;
  },
};

/** Water tiles of an exit's channel at the map's edge. */
function exitTiles(plan: PremisePlan, r: WaterRaster): Set<number> {
  const exits = new Set(plan.exits.map((e) => e.id));
  const out = new Set<number>();
  plan.links.forEach((l, li) => {
    if (!exits.has(l.to)) return;
    for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li + 1) out.add(i);
  });
  return out;
}

const waterExits: Invariant = {
  id: "water.exits",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    const r = w.raster;
    const { W, H } = r;
    const { path } = stageFlow(w);
    const exits = exitTiles(ctx.plan, r);
    for (let i = 0; i < W * H; i++) {
      if (!path[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (!(r.lake[i] || r.channel[i])) return fail(`Water leaves its bed at ${x}, ${y}`);
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (edge && !exits.has(i)) return fail(`Water leaves the map at ${x}, ${y}, no planned exit`);
    }
    return OK;
  },
};

const waterWet: Invariant = {
  id: "water.wet",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    const r = w.raster;
    const N = r.W * r.H;
    const { path } = stageFlow(w);
    const wetBody = new Uint8Array(ctx.plan.bodies.length);
    const wetLink = new Uint8Array(ctx.plan.links.length);
    // (a link is wet where water comes down it: at its head, or just past its first row when one shuts it; its mouth
    // holds the water it runs into either way)
    const head = ctx.plan.links.map((l) => {
      const row = r.rows[l.id]?.[0];
      return row ? Math.max(...row.map((i) => r.along[i])) : -Infinity;
    });
    for (let i = 0; i < N; i++) {
      if (!path[i]) continue;
      if (r.lake[i]) wetBody[r.lake[i] - 1] = 1;
      const k = r.channel[i] - 1;
      if (k >= 0 && r.along[i] > head[k] && r.along[i] <= Math.max(0, head[k]) + HEAD) wetLink[k] = 1;
    }
    for (const [k, b] of ctx.plan.bodies.entries()) {
      const want = !w.table.bodies[b.id].dry;
      if (want !== !!wetBody[k]) return fail(`${b.id} is ${wetBody[k] ? "wet" : "dry"}, the table has it ${want ? "wet" : "dry"}`);
    }
    for (const [k, l] of ctx.plan.links.entries()) {
      if (!l.path) continue;
      const want = w.table.links[l.id].wet;
      if (want !== !!wetLink[k]) return fail(`${l.id} is ${wetLink[k] ? "wet" : "dry"}, the table has it ${want ? "wet" : "dry"}`);
    }
    return OK;
  },
};

/** One fall as built: its lip's tiles, notch and pier counts, its crest and the drop to its pool's spill. */
export function fallOf(plan: PremisePlan, w: StageWater, id: string): { lip: number; plain: number; low: number; high: number; drop: number; pours: number } {
  const r = w.raster;
  const l = plan.links.find((k) => k.id === id)!;
  const li = plan.links.indexOf(l);
  const f = l.fall!;
  const lip = r.lips[id] ?? [];
  const { spill } = stageFlow(w);
  let plain = 0;
  let low = 0;
  let high = 0;
  for (const i of lip) {
    const h = r.heights[i];
    if (h === f.crest) plain++;
    else if (h === f.crest - 1) low++;
    else if (h === f.crest + 1) high++;
  }
  let below = Infinity;
  for (let i = 0; i < r.W * r.H; i++) if (r.pool[i] === li + 1 && spill[i] < below) below = spill[i];
  // (a lip tile pours where a neighbour is its pool's, lower)
  let pours = 0;
  const nb = new Int32Array(4);
  for (const i of lip) {
    near4(r.W, r.H, i, nb);
    if (Array.from(nb).some((j) => j >= 0 && r.pool[j] === li + 1 && r.heights[j] < r.heights[i])) pours++;
  }
  return { lip: lip.length, plain, low, high, drop: f.crest - below, pours };
}

const waterFalls: Invariant = {
  id: "water.falls",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    for (const l of ctx.plan.links) {
      if (!l.fall) continue;
      const f = l.fall;
      const got = fallOf(ctx.plan, w, l.id);
      const width = w.table.links[l.id].width;
      if (got.lip < (l.path && l.kind === "fall" ? f.width : width)) return fail(`${l.id}'s lip is ${got.lip} tiles, built for ${l.path && l.kind === "fall" ? f.width : width}`);
      if (got.pours < got.lip) return fail(`${l.id}: ${got.lip - got.pours} of its lip's tiles pour into no pool`);
      if (got.low !== f.notch + f.breach) return fail(`${l.id} has ${got.low} tiles a level under its crest, planned ${f.notch + f.breach}`);
      if (got.high !== f.piers) return fail(`${l.id} has ${got.high} piers, planned ${f.piers}`);
      if (got.drop < f.height - LEVEL_SLACK) return fail(`${l.id} drops ${got.drop}, planned ${f.height}`);
    }
    return OK;
  },
};

const waterRows: Invariant = {
  id: "water.rows",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    for (const [li, l] of ctx.plan.links.entries()) {
      const rows = w.raster.rows[l.id] ?? [];
      if (rows.length !== l.rows.length) return fail(`${l.id} has ${rows.length} rows, planned ${l.rows.length}`);
      for (const [k, row] of rows.entries()) if (!rowSpans(ctx.plan, w.raster, li, row)) return fail(`${l.id}'s row ${k + 1} leaves a way round it`);
    }
    return OK;
  },
};

/** Each weir whole (raster/weirs.ts): as many columns as its width with the bed in front under the crest, the crest
 *  two tiles thick, and its body's water behind it under the crest. A neighbour that crowds a weir (another channel's
 *  head beside it, the guard between two waters) starves the columns it touches, and the split is no longer the
 *  table's. */
const waterWeirs: Invariant = {
  id: "water.weirs",
  at: "land",
  test(ctx) {
    const w = need(ctx);
    const r = w.raster;
    for (const [li, l] of ctx.plan.links.entries()) {
      const wr = r.weirs[l.id];
      if (!wr) continue;
      const crest = (l.bed as number[])[0];
      const from = ctx.plan.bodies.findIndex((b) => b.id === l.from) + 1;
      const ours = (i: number) => i >= 0 && r.channel[i] === li + 1;
      let whole = 0;
      for (const [front, a, b, behind] of wr.cols)
        if (ours(front) && r.heights[front] < crest && ours(a) && ours(b) && r.heights[a] === crest && r.heights[b] === crest && behind >= 0 && (ours(behind) || r.lake[behind] === from) && r.heights[behind] < crest) whole++;
      const width = weirWidth(l);
      if (whole < width) return fail(`${l.id}'s weir has ${whole} whole columns, built for ${width}`);
    }
    return OK;
  },
};

/** Stage 1's `land` invariants (every premise's). */
export const WATER_CHECKS: Invariant[] = [waterLevels, waterExits, waterWet, waterFalls, waterRows, waterWeirs];
