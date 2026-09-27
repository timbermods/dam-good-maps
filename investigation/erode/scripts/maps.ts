// The demo's land, saved as small fixtures in maps/ (about 30–90 KB each):
// - Highlands and Canyon at 128², from the editor's generator (src/core/gen/generate.ts), with their
//   settled water, soil moisture and objects;
// - a crater on the Highlands, struck with Craterize (investigation/craterize's engine) and its water
//   settled again with the game's rules;
// - a tall map at 128² (heights to 19): design version 2 at Verticality 85, unlocked (scripts/tall.ts),
//   its rivers' springs placed where the plan starts them and the water settled with the canonical
//   settle; no other objects (the dev generator can't build above 16 yet).
//
//   node --import tsx investigation/erode/scripts/maps.ts        (about a minute)
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { toMapObject } from "../../../src/core/features/build";
import { waterSource, type EntitySpec } from "../../../src/core/format/entities";
import { FOOTPRINTS } from "../../../src/core/format/footprints";
import { JsonFloat } from "../../../src/core/format/json";
import { generate } from "../../../src/core/gen/generate";
import { EMITTERS, moistureBarrier, objectTile, waterModel } from "../../../src/core/sim/model";
import { moisture } from "../../../src/core/sim/moisture";
import { canonicalSettle } from "../../../src/core/sim/prefill";
import { makeSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { DEFAULTS as CRATER, impact, settleImpact, type CraterMap } from "../../craterize/engine";
import { cleanPitsAndSpikes, fillDryHollows, mergeSmallRegions } from "../../generative/proto/levels";
import { fieldV2 } from "../../generative/v2/field";
import { drawGenomeV2 } from "../../generative/v2/genome";
import { planHydro } from "../../generative/v2/hydro";
import { naturalRamps, relaxEdges, snapLevelsV2 } from "../../generative/v2/levels";
import { geology } from "../core/random";
import { toJson, type ErodeMap, type Thing } from "../core/map";
import { png } from "./png";
import { shade } from "./survey";

export const LAND = {
  highlands: { theme: "highlands" as ThemeId, seed: 5 },
  canyon: { theme: "canyon" as ThemeId, seed: 2 },
  tall: { seed: 2 },
  crater: { origin: [96, 102] as [number, number], power: 42, seed: 3, walls: "steep" as const },
};

const dir = new URL("../maps/", import.meta.url);
const look = new URL("../local/maps/", import.meta.url);
mkdirSync(dir, { recursive: true });
mkdirSync(look, { recursive: true });

const plain = (e: EntitySpec[]): EntitySpec[] => JSON.parse(JSON.stringify(e, (_k, v) => (v instanceof JsonFloat ? v.value : v)));

function things(entities: EntitySpec[]): Thing[] {
  return entities.map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, ...(e.orientation && e.orientation !== "Cw0" ? { orientation: e.orientation } : {}) }));
}

/** The tiles an emitter's water comes from and a margin: Erode leaves them exactly as they are. */
function keepMask(W: number, H: number, entities: EntitySpec[]): Uint8Array {
  const keep = new Uint8Array(W * H);
  for (const e of entities) {
    if (!EMITTERS[e.template]) continue;
    const fp = FOOTPRINTS[e.template]?.size ?? [1, 1, 1];
    for (let y = 0; y < fp[1]; y++)
      for (let x = 0; x < fp[0]; x++) {
        const [tx, ty] = objectTile(e as Parameters<typeof objectTile>[0], x, y);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = tx + dx, yy = ty + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) keep[yy * W + xx] = 1;
          }
      }
  }
  return keep;
}

function moistOf(W: number, H: number, heights: Uint8Array, depth: ArrayLike<number>, contamination: ArrayLike<number>, entities: EntitySpec[]): Uint8Array {
  const m = moisture(heights, Float64Array.from(depth), Float64Array.from(contamination), W, H, moistureBarrier(W, H, entities.map(toMapObject)));
  return Uint8Array.from(m, (v) => (v > 0 ? 1 : 0));
}

function save(m: ErodeMap): void {
  const json = JSON.stringify(toJson(m));
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(new URL(`${m.id}.json.gz`, dir), gz);
  writeFileSync(new URL(`${m.id}.png`, look), png(m.W, m.H, shade(m.W, m.H, m.heights, m.water)));
  console.log(m.id, `${(gz.length / 1024).toFixed(1)} KB`, `hard beds ${m.rock.flatMap((v, z) => (v ? [z] : [])).join(",")}`, `max ${Math.max(...m.heights)}`, `${m.things.length} objects`);
}

function generated(id: string, theme: ThemeId, seed: number): { map: ErodeMap; entities: EntitySpec[] } {
  const g = generate(makeSpec({ theme, seed, size: { x: 128, y: 128 } }));
  if (!g.report.passed) throw new Error(`${theme} ${seed} did not pass`);
  const b = g.built;
  const entities = plain(b.entities);
  const map: ErodeMap = {
    id,
    name: `${theme === "highlands" ? "Highlands" : "Canyon"} · seed ${seed} · 128²`,
    source: `The editor's generator (src/core/gen/generate.ts), theme ${theme}, seed ${seed}, 128²`,
    W: b.W,
    H: b.H,
    heights: b.heights.slice(),
    water: Float32Array.from(b.water),
    contamination: Float32Array.from(b.contamination),
    moist: Uint8Array.from(b.moisture, (v) => (v > 0 ? 1 : 0)),
    keep: keepMask(b.W, b.H, entities),
    rock: geology(b.heights),
    things: things(entities),
  };
  return { map, entities };
}

const high = generated("highlands", LAND.highlands.theme, LAND.highlands.seed);
save(high.map);
save(generated("canyon", LAND.canyon.theme, LAND.canyon.seed).map);

// the crater: Craterize's strike on the Highlands, its water settled again
{
  const base = high.map;
  const cm: CraterMap = {
    name: "crater",
    W: base.W,
    H: base.H,
    heights: base.heights.slice(),
    entities: plain(high.entities),
    water: { depth: Float64Array.from(base.water), contamination: Float64Array.from(base.contamination) },
    maxHeight: 22,
    rockLayers: geology(base.heights),
    fallen: [],
  };
  const [ox, oy] = LAND.crater.origin;
  const plan = impact(cm, { ...CRATER, walls: LAND.crater.walls, power: LAND.crater.power, seed: LAND.crater.seed }, { origin: oy * base.W + ox });
  const m = plan.map;
  settleImpact(m);
  const entities = m.entities.filter((e) => !(e.components as { LivingNaturalResource?: { IsDead?: boolean } })?.LivingNaturalResource?.IsDead);
  save({
    id: "crater",
    name: `Highlands · seed ${LAND.highlands.seed} · a crater · 128²`,
    source: `The Highlands above, struck with Craterize (investigation/craterize, Strike at ${ox},${oy}, Power ${LAND.crater.power}, steep walls, seed ${LAND.crater.seed}); water settled again`,
    W: m.W,
    H: m.H,
    heights: m.heights.slice(),
    water: Float32Array.from(m.water.depth),
    contamination: Float32Array.from(m.water.contamination),
    moist: moistOf(m.W, m.H, m.heights, m.water.depth, m.water.contamination, entities),
    keep: keepMask(m.W, m.H, entities),
    rock: cm.rockLayers,
    things: things(entities),
  });
}

// the tall map
{
  const W = 128, seed = LAND.tall.seed;
  const g = drawGenomeV2("highlands", seed, W, W, 0, { vt: 85, unlocked: true });
  const F = fieldV2(g, seed, W, W);
  const h = snapLevelsV2(F.E, g, seed, W, W);
  relaxEdges(h, W, W);
  const hy = planHydro(F.E, h, g, seed, W, W, 0);
  relaxEdges(h, W, W);
  const keepW = Uint8Array.from(hy.water, (v) => (v === 1 || v === 2 ? 1 : 0));
  mergeSmallRegions(h, W, W, 4, keepW);
  cleanPitsAndSpikes(h, W, W, keepW);
  fillDryHollows(h, W, W, keepW);
  naturalRamps(h, W, W, keepW, new Uint8Array(W * W), g, seed, 0);
  // springs where the plan starts each river: its first channel tiles
  const entities: EntitySpec[] = [];
  for (const r of hy.rivers) {
    const entry = r.params.entry as { spring?: [number, number] };
    const [px, py] = (entry.spring ?? r.params.path[0]) as unknown as [number, number];
    const tiles: number[] = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(px) + dx, y = Math.round(py) + dy;
        if (x < 0 || y < 0 || x >= W || y >= W || !keepW[y * W + x] || Math.hypot(dx, dy) > r.params.width / 2 + 0.5) continue;
        tiles.push(y * W + x);
      }
    const each = Math.min(8, Math.round((r.params.flow / Math.max(1, tiles.length)) * 1000) / 1000);
    for (const i of tiles) entities.push(plain([waterSource({ id: `spring-${r.id}-${i}`, owner: "erode-tall", x: i % W, y: Math.floor(i / W), z: h[i], strength: each })])[0]);
  }
  const settle = canonicalSettle(waterModel(W, W, h, entities.map(toMapObject)));
  save({
    id: "tall",
    name: `Tall · Highlands seed ${seed} · Verticality 85 · 128²`,
    source: `Design version 2 (investigation/generative/v2) at Verticality 85, unlocked, seed ${seed}: the land before the build (tops at ${Math.max(...h)}); springs at its planned rivers' heads, water by the canonical settle`,
    W,
    H: W,
    heights: h,
    water: Float32Array.from(settle.depth),
    contamination: Float32Array.from(settle.contamination),
    moist: moistOf(W, W, h, settle.depth, settle.contamination, entities),
    keep: keepMask(W, W, entities),
    rock: geology(h),
    things: things(entities),
  });
}
