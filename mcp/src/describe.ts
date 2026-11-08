// What is where on a map, in tile coordinates, for the MCP server's `describe` and `generate` (D141, D501): plain data
// read from the core (the session's map, its features, the analysis), never a change to the map.

import type { CheckGroups } from "../../src/core/doc/checkItems";
import { describeTileOf } from "../../src/core/doc/describeTile";
import type { MapSession } from "../../src/core/doc/session";
import { components } from "../../src/core/analysis/regions";
import { waterStory } from "../../src/core/analysis/story";
import { standingForms } from "../../src/core/analysis/vertical";
import { THEME_NAMES } from "../../src/core/spec/mapspec";
import { rowOf } from "./maps";

type Rect = { x0: number; y0: number; x1: number; y1: number };

const OBJECT_NAMES: Record<string, string> = {
  UndergroundRuins: "mine site",
  GeothermalField: "geothermal field",
  SmallRelic: "small relic",
  LargeRelic: "large relic",
  NaturalDam: "natural dam",
  Blockage: "blockage",
  UnstableCore: "unstable core",
  Aquifer: "aquifer",
  WaterSeep: "seep",
};

const PLANTS = new Set(["Pine", "Birch", "Oak", "Maple", "ChestnutTree", "Mangrove", "Succulent", "BlueberryBush", "Thorns"]);

function boundsOf(tiles: Iterable<number>, W: number): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** The map in a few lines: its name, size, start, water and checks. */
export function summaryOf(s: MapSession, checks: CheckGroups | null): string {
  const b = s.built;
  const spec = s.spec;
  const lines: string[] = [];
  lines.push(`${s.meta.name}: ${b.W}×${b.H} tiles${spec ? `, ${THEME_NAMES[spec.theme]}, seed ${spec.seed}, designed for ${spec.designedFor}` : ", an opened map"}.`);
  const st = b.start;
  lines.push(st ? `Start: X ${st.x} · Y ${st.y}, level ${st.z}.` : "Start: none. Place one before saving.");
  let wet = 0;
  let bad = 0;
  let deepest = 0;
  for (let i = 0; i < b.water.length; i++)
    if (b.water[i] > 0.05) {
      wet++;
      if (b.contamination[i] >= 0.05) bad++;
      deepest = Math.max(deepest, b.water[i]);
    }
  const sources = b.entities.filter((e) => e.template === "WaterSource").length;
  const badSources = b.entities.filter((e) => e.template === "BadwaterSource").length;
  lines.push(`Water: ${wet} wet tiles (${((100 * wet) / (b.W * b.H)).toFixed(1)}% of the map), ${bad} of them badwater, deepest ${deepest.toFixed(1)}; ${sources} water source${sources === 1 ? "" : "s"}, ${badSources} badwater source${badSources === 1 ? "" : "s"}.`);
  let top = 0;
  let low = 255;
  for (let i = 0; i < b.heights.length; i++) {
    top = Math.max(top, b.heights[i]);
    low = Math.min(low, b.heights[i]);
  }
  lines.push(`Ground: levels ${low} to ${top}${s.columns.size ? `; ${s.columns.size} tiles have caves or overhangs` : ""}.`);
  if (checks) {
    const n = checks.blocking.length;
    const w = checks.warnings.length;
    lines.push(n ? `Checks: ${n} stop the map saving (${checks.blocking.slice(0, 2).map((c) => rowOf(c).message).join("; ")}).` : w ? `Checks: it saves; ${w} warning${w > 1 ? "s" : ""} (${checks.warnings.slice(0, 2).map((c) => c.message).join("; ")}).` : "Checks: all pass.");
  }
  return lines.join("\n");
}

/** Mean ground level in a grid of cells, rows from the top (north, higher Y) down. */
function heightGrid(s: MapSession, cells: number): { cell: number; rows: { y0: number; y1: number; levels: number[] }[] } {
  const b = s.built;
  const cell = Math.max(1, Math.ceil(Math.max(b.W, b.H) / cells));
  const rows: { y0: number; y1: number; levels: number[] }[] = [];
  for (let y1 = b.H - 1; y1 >= 0; y1 -= cell) {
    const y0 = Math.max(0, y1 - cell + 1);
    const levels: number[] = [];
    for (let x0 = 0; x0 < b.W; x0 += cell) {
      let sum = 0;
      let n = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x < Math.min(b.W, x0 + cell); x++) {
          sum += b.heights[y * b.W + x];
          n++;
        }
      levels.push(Math.round(sum / n));
    }
    rows.push({ y0, y1, levels });
  }
  return { cell, rows };
}

/** What is where: the start, the water bodies and sources, the rivers and the map's other features, its landmarks,
 *  its objects, its heights, and (when given) each asked tile. */
export function describeMap(s: MapSession, opts: { tiles?: [number, number][]; checks?: CheckGroups | null } = {}): Record<string, unknown> {
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = b.water[i] > 0.05 ? 1 : 0;
  const { labels, sizes } = components(wet, W, H);
  const bodies = sizes.map((size, k) => ({ k, size, tiles: [] as number[], bad: 0, deepest: 0, volume: 0 }));
  for (let i = 0; i < N; i++) {
    const k = labels[i];
    if (k < 0) continue;
    const body = bodies[k];
    body.tiles.push(i);
    if (b.contamination[i] >= 0.05) body.bad++;
    body.deepest = Math.max(body.deepest, b.water[i]);
    body.volume += b.water[i];
  }
  const sourceList = b.entities.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource");
  const water = bodies
    .sort((a, b2) => b2.size - a.size)
    .slice(0, 16)
    .map((body) => {
      const inBody = sourceList.filter((e) => labels[e.y * W + e.x] === body.k).length;
      return {
        tiles: body.size,
        area: boundsOf(body.tiles, W),
        badwaterShare: +(body.bad / body.size).toFixed(2),
        deepest: +body.deepest.toFixed(1),
        volume: Math.round(body.volume),
        sources: inBody,
      };
    });
  const sources = sourceList.map((e) => {
    // (the strength as the file holds it: a number, or {value} as the game writes it)
    type Strength = { SpecifiedStrength?: number | { value?: number } };
    const ws = ((e.before as { WaterSource?: Strength } | undefined)?.WaterSource ?? (e.components as { WaterSource?: Strength }).WaterSource)?.SpecifiedStrength;
    const strength = typeof ws === "number" ? ws : ws?.value;
    return { id: e.id, kind: e.template === "WaterSource" ? "water" : "badwater", x: e.x, y: e.y, z: e.z, ...(strength !== undefined ? { strength } : {}) };
  });
  const rivers: Record<string, unknown>[] = [];
  const features: Record<string, unknown>[] = [];
  for (const f of s.features) {
    const p = f.params as unknown as Record<string, unknown>;
    if (f.kind === "river") {
      const path = (p.path as [number, number][]) ?? [];
      const pick = path.length <= 8 ? path : [0, 1, 2, 3, 4, 5, 6, 7].map((k) => path[Math.round((k * (path.length - 1)) / 7)]);
      rivers.push({ id: f.id, role: (f as { role?: string }).role ?? "river", ...(p.badwater ? { badwater: true } : {}), from: path[0], to: path.at(-1), length: path.length, course: pick.map(([x, y]) => [Math.round(x), Math.round(y)]) });
    } else if (f.kind === "mapObject" || f.kind === "setPiece") {
      const kind = (p.kind as string) ?? f.kind;
      const place = (p.placement ?? p.plan ?? p.request) as { x?: number; y?: number; at?: [number, number]; area?: [number, number, number][] } | undefined;
      const at = place?.x !== undefined ? [place.x, place.y] : place?.at;
      features.push({ id: f.id, kind, ...(at ? { at } : {}), ...(place?.area?.length ? { area: boundsOf(place.area.flatMap(([y, x0, x1]) => Array.from({ length: x1 - x0 + 1 }, (_, k) => y * W + x0 + k)), W) } : {}) });
    } else if (f.kind === "lake") {
      features.push({ id: f.id, kind: "lake", ...(p.at ? { at: p.at } : {}) });
    }
  }
  // the counts of plants and ruins, and where each other object stands
  const counts: Record<string, number> = {};
  const objects: Record<string, unknown>[] = [];
  for (const e of b.entities) {
    if (e.template === "WaterSource" || e.template === "BadwaterSource") continue;
    if (PLANTS.has(e.template) || e.template.startsWith("RuinColumn") || e.template === "Slope") {
      const k = e.template.startsWith("RuinColumn") ? "ruin column" : e.template;
      counts[k] = (counts[k] ?? 0) + 1;
    } else objects.push({ id: e.id, kind: OBJECT_NAMES[e.template] ?? e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation });
  }
  const landmarks = standingForms(b.heights, W, H, 12)
    .filter((f) => f.prominence >= 3)
    .slice(0, 8)
    .map((f) => {
      const x = f.peak % W;
      const y = (f.peak - x) / W;
      return { peak: [x, y], level: b.heights[f.peak], rises: f.prominence, tiles: f.tiles.length, area: boundsOf(f.tiles, W) };
    });
  const story = waterStory(W, H, b.water, s.features, b.contamination);
  const out: Record<string, unknown> = {
    name: s.meta.name,
    size: { x: W, y: H },
    coordinates: "Tiles: X 0 to width−1 from west to east, Y 0 to height−1 from south to north. A tile's index is y·width + x. Levels count up from 0.",
    start: b.start ? { x: b.start.x, y: b.start.y, z: b.start.z } : null,
    description: s.description().text,
    water: { bodies: water, story: { mainShare: story.mainShare, otherSystems: story.systems, ponds: story.ponds, readable: story.readable } },
    sources,
    rivers,
    features,
    landmarks,
    objects,
    counts,
    heights: heightGrid(s, 16),
    ...(s.columns.size ? { caves: { tiles: s.columns.size, area: boundsOf(s.columns.keys(), W) } } : {}),
  };
  if (opts.tiles?.length) out.tiles = opts.tiles.slice(0, 24).map(([x, y]) => describeTileOf(s, x, y) ?? { x, y, off: "off the map" });
  if (opts.checks) {
    const c = opts.checks;
    out.checks = { stopSaving: c.blocking.map(rowOf), warnings: c.warnings.map(rowOf), advice: c.advisory.map(rowOf), ...(c.existing.length ? { alreadyThere: c.existing.map(rowOf) } : {}) };
  }
  return out;
}
